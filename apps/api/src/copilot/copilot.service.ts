import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  getProvider,
  toStrictJsonSchema,
  type ChatMessage,
} from '@workflow/ai';
import type { WorkflowGraph } from '@workflow/shared';
import { getCatalogEntry } from '@workflow/nodes/catalog';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { AiSuggestionsService } from '../ai-suggestions/ai-suggestions.service';
import { workflowGraphSchema } from '../workflows/graph.schema';
import { CopilotChatDto } from './dto/copilot-chat.dto';

const copilotResponseSchema = z.object({
  reply: z.string(),
  proposedGraphJson: z
    .string()
    .optional()
    .describe(
      'Se voce tiver uma proposta CONCRETA de alteracao no grafo, retorne aqui o grafo completo atualizado (nodes+edges+viewport) como uma string JSON valida. Caso contrario, omita este campo.',
    ),
});

const COPILOT_JSON_SCHEMA = toStrictJsonSchema(
  z.toJSONSchema(copilotResponseSchema),
) as Record<string, unknown>;

export interface CopilotChatResult {
  content: string;
  suggestionId?: string;
  proposedGraph?: WorkflowGraph;
}

/**
 * Copilot no editor (Fase 11): chat com contexto do fluxo atual (grafo +
 * ultimas execucoes). Pode propor uma edicao completa do grafo, aplicavel
 * com um clique (reaproveita o mesmo workflowGraphSchema/saveGraph do editor).
 */
@Injectable()
export class CopilotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly workflows: WorkflowsService,
    private readonly suggestions: AiSuggestionsService,
  ) {}

  async chat(
    workspaceId: string,
    workflowId: string,
    dto: CopilotChatDto,
  ): Promise<CopilotChatResult> {
    const workflow = await this.workflows.findOne(workspaceId, workflowId);
    const graph = workflow.currentVersion?.graph as unknown as
      WorkflowGraph | undefined;
    if (!graph) {
      throw new BadRequestException(
        'Este fluxo ainda nao tem uma versao salva.',
      );
    }

    const recentExecutions = await this.prisma.execution.findMany({
      where: { workflowId },
      orderBy: { startedAt: 'desc' },
      take: 5,
      select: {
        status: true,
        durationMs: true,
        error: true,
        costUsd: true,
        tokensTotal: true,
        startedAt: true,
      },
    });

    const apiKey =
      dto.provider === 'ollama'
        ? ''
        : await this.getCredential(workspaceId, dto.credential ?? '');
    const provider = getProvider(dto.provider);

    const systemPrompt = buildSystemPrompt(
      workflow.name,
      graph,
      recentExecutions,
    );
    const history: ChatMessage[] = (dto.history ?? []).map((item) => ({
      role: item.role,
      content: item.content,
    }));

    const result = await provider.chat({
      apiKey,
      model: dto.model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: dto.message },
      ],
      outputSchema: COPILOT_JSON_SCHEMA,
    });

    const parsed = copilotResponseSchema.safeParse(
      safeJsonParse(result.content),
    );
    if (!parsed.success) {
      return { content: result.content };
    }

    if (!parsed.data.proposedGraphJson) {
      return { content: parsed.data.reply };
    }

    const candidateGraph = safeJsonParse(parsed.data.proposedGraphJson);
    const graphValidation = workflowGraphSchema.safeParse(candidateGraph);
    if (!graphValidation.success) {
      // Proposta invalida: devolve so a resposta em texto, sem quebrar o chat.
      return { content: parsed.data.reply };
    }

    const suggestionRow = await this.suggestions.create({
      workspaceId,
      type: 'copilot',
      workflowId,
      payload: {
        message: dto.message,
        reply: parsed.data.reply,
        proposedGraph: graphValidation.data,
      },
    });

    return {
      content: parsed.data.reply,
      suggestionId: suggestionRow.id,
      proposedGraph: graphValidation.data,
    };
  }

  async applySuggestion(
    workspaceId: string,
    userId: string,
    suggestionId: string,
  ) {
    const suggestionRow = await this.suggestions.findOne(
      workspaceId,
      suggestionId,
    );
    if (suggestionRow.type !== 'copilot' || !suggestionRow.workflowId) {
      throw new BadRequestException('Sugestao invalida para aplicacao.');
    }
    const payload = suggestionRow.payload as unknown as {
      proposedGraph: WorkflowGraph;
    };

    const updated = await this.workflows.saveGraph(
      workspaceId,
      suggestionRow.workflowId,
      userId,
      payload.proposedGraph,
    );
    await this.suggestions.resolve(workspaceId, suggestionId, 'accepted');
    return updated;
  }

  private async getCredential(
    workspaceId: string,
    name: string,
  ): Promise<string> {
    if (!name) {
      throw new BadRequestException('Informe a credencial do provider de IA.');
    }
    const credential = await this.prisma.credential.findFirst({
      where: { workspaceId, name },
    });
    if (!credential) {
      throw new NotFoundException(
        `Credencial "${name}" nao encontrada neste workspace.`,
      );
    }
    return this.crypto.decrypt(credential.encryptedData);
  }
}

function buildSystemPrompt(
  workflowName: string,
  graph: WorkflowGraph,
  recentExecutions: Array<{
    status: string;
    durationMs: number | null;
    error: string | null;
    costUsd: number;
    tokensTotal: number;
    startedAt: Date;
  }>,
): string {
  const nodesDescription = graph.nodes
    .map((node) => {
      const catalogEntry = getCatalogEntry(node.type);
      return `- id="${node.id}" type="${node.type}" category="${node.category}" label="${node.label}" (${catalogEntry?.label ?? node.type}) config=${JSON.stringify(node.config)}${
        node.retry
          ? ` retry={attempts:${node.retry.attempts},backoffMs:${node.retry.backoffMs}}`
          : ''
      }`;
    })
    .join('\n');
  const edgesDescription = graph.edges
    .map(
      (edge) =>
        `- ${edge.source} -> ${edge.target}${edge.sourceHandle ? ` (branch: ${edge.sourceHandle})` : ''}`,
    )
    .join('\n');
  const executionsDescription = recentExecutions.length
    ? recentExecutions
        .map(
          (execution) =>
            `- ${execution.startedAt.toISOString()}: status=${execution.status} duracao=${execution.durationMs ?? '?'}ms custo=$${execution.costUsd.toFixed(4)} tokens=${execution.tokensTotal}${execution.error ? ` erro="${execution.error}"` : ''}`,
        )
        .join('\n')
    : '(nenhuma execucao ainda)';

  return `Voce e o Copilot de um editor de workflows de automacao (estilo n8n/Zapier). Responda em portugues, de forma direta e pratica.

Fluxo atual: "${workflowName}"

Nodes:
${nodesDescription || '(nenhum node)'}

Edges:
${edgesDescription || '(nenhuma edge)'}

Ultimas execucoes:
${executionsDescription}

O usuario pode perguntar coisas como "como melhorar este fluxo?", "existe um gargalo?", "posso reduzir custos?", "como deixar mais rapido?". Responda com base nos dados reais acima (nao invente numeros).

Se sua resposta incluir uma sugestao concreta e aplicavel de mudanca no GRAFO (ex.: adicionar retry, reordenar nodes, adicionar um node), preencha "proposedGraphJson" com o grafo COMPLETO atualizado (todos os nodes e edges existentes, nao so o que mudou, mais a mudanca), serializado como string JSON EXATAMENTE neste formato (nao use outro formato, ex.: nao existe campo "data"):
{
  "nodes": [
    { "id": "n1", "type": "trigger.manual", "category": "trigger", "label": "Manual Trigger", "position": {"x":0,"y":0}, "config": {}, "retry": {"attempts": 3, "backoffMs": 2000} }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2" }
  ],
  "viewport": {"x":0,"y":0,"zoom":1}
}
Note: "retry" e opcional (so incluir no node que deve ter retry) e tem EXATAMENTE os campos "attempts" (numero de tentativas) e "backoffMs" (nao "maxAttempts" nem outro nome). "config" e sempre um objeto (pode ser vazio {}), nunca omitido. Reaproveite o "type"/"category"/"config" de cada node EXATAMENTE como estao na lista de nodes acima, so alterando o que for necessario pra atender o pedido. Se for so uma resposta analitica/textual sem mudanca de grafo, omita o campo "proposedGraphJson" por completo.`;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
