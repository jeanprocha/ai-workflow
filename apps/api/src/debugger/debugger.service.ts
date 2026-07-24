import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { getProvider, toStrictJsonSchema } from '@workflow/ai';
import type { WorkflowGraph, WorkflowNode } from '@workflow/shared';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { AiSuggestionsService } from '../ai-suggestions/ai-suggestions.service';
import { DiagnoseExecutionDto } from './dto/diagnose-execution.dto';

// z.number() puro (sem .int()/.min()/.max()) de proposito: a saida estruturada
// da Anthropic (output_config.format.schema) rejeita minItems/maxItems em
// arrays E minimum/maximum em integers ("not supported"). Os limites praticos
// (1-10 tentativas, ate 3 sugestoes, etc.) sao reforcados no codigo depois do
// parse (clamp + Math.round), nao no JSON Schema enviado ao modelo.
const suggestionSchema = z.object({
  causaProvavel: z.string(),
  sugestoes: z.array(
    z.object({
      tipo: z.enum(['retry', 'timeout', 'fallback']),
      descricao: z.string(),
      /** So relevante quando tipo === "retry". */
      attempts: z.number().optional(),
      backoffMs: z.number().optional(),
      /** So relevante quando tipo === "timeout" e o node tiver um campo de timeout. */
      timeoutMs: z.number().optional(),
    }),
  ),
});

const SUGGESTION_JSON_SCHEMA = toStrictJsonSchema(
  z.toJSONSchema(suggestionSchema),
) as Record<string, unknown>;

/** Campos de config tratados como "timeout do node" ao sugerir/aplicar o tipo "timeout". */
const TIMEOUT_CONFIG_KEYS = ['timeoutMs', 'timeout'];

function findTimeoutKey(config: Record<string, unknown>): string | null {
  return TIMEOUT_CONFIG_KEYS.find((key) => key in config) ?? null;
}

export interface DiagnosisResult {
  suggestionId: string;
  nodeId: string;
  causaProvavel: string;
  sugestoes: Array<{
    tipo: 'retry' | 'timeout' | 'fallback';
    descricao: string;
    aplicavel: boolean;
    attempts?: number;
    backoffMs?: number;
    timeoutMs?: number;
  }>;
}

/**
 * AI Debugger (Fase 11): analisa uma execucao que falhou e sugere causa +
 * fixes acionaveis (retry/timeout aplicaveis com um clique; fallback fica
 * informativo, ja que a engine e fail-fast e nao tem um mecanismo de
 * fallback entre nodes hoje).
 */
@Injectable()
export class DebuggerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly workflows: WorkflowsService,
    private readonly suggestions: AiSuggestionsService,
  ) {}

  async diagnose(
    workspaceId: string,
    executionId: string,
    dto: DiagnoseExecutionDto,
  ): Promise<DiagnosisResult> {
    const execution = await this.prisma.execution.findFirst({
      where: { id: executionId, workflow: { workspaceId } },
      include: {
        steps: { orderBy: { startedAt: 'asc' } },
        logs: { orderBy: { createdAt: 'asc' } },
        version: true,
      },
    });
    if (!execution) {
      throw new NotFoundException('Execucao nao encontrada.');
    }
    if (execution.status !== 'failed') {
      throw new BadRequestException(
        'So e possivel diagnosticar execucoes que falharam.',
      );
    }

    const failedStep = [...execution.steps]
      .reverse()
      .find((step) => step.status === 'failed');
    if (!failedStep) {
      throw new BadRequestException(
        'Execucao marcada como failed, mas nenhum step com erro foi encontrado.',
      );
    }

    const graph = execution.version.graph as unknown as WorkflowGraph;
    const node = graph.nodes.find((n) => n.id === failedStep.nodeId);
    if (!node) {
      throw new BadRequestException(
        `Node "${failedStep.nodeId}" nao encontrado no grafo desta execucao.`,
      );
    }

    const relevantLogs = execution.logs
      .filter((log) => log.nodeId === node.id)
      .map(
        (log) => `[${log.level}] ${log.event}: ${JSON.stringify(log.payload)}`,
      )
      .join('\n');

    const apiKey =
      dto.provider === 'ollama'
        ? ''
        : await this.getCredential(workspaceId, dto.credential ?? '');
    const provider = getProvider(dto.provider);

    const prompt = `Um node de um workflow de automacao falhou. Analise e responda em portugues.

Node: type="${node.type}" label="${node.label}"
Config atual: ${JSON.stringify(node.config)}
Retry atual: ${JSON.stringify(node.retry ?? { attempts: 1, backoffMs: 0 })}
Tentativa: ${failedStep.attempt}
Erro: ${failedStep.error}
Logs do node durante a execucao:
${relevantLogs || '(nenhum)'}

Diga a causa provavel do erro em uma frase curta, e ate 3 sugestoes de correcao, cada uma de um tipo:
- "retry": aumentar/adicionar tentativas com backoff (preencha attempts e backoffMs).
- "timeout": aumentar o timeout do node, so faz sentido se o erro parecer ser de tempo esgotado (preencha timeoutMs).
- "fallback": indicar que o fluxo deveria ter um caminho alternativo se este node falhar (nao preencha attempts/backoffMs/timeoutMs — hoje isso exige edicao manual do grafo).`;

    const result = await provider.chat({
      apiKey,
      model: dto.model,
      messages: [{ role: 'user', content: prompt }],
      outputSchema: SUGGESTION_JSON_SCHEMA,
    });

    const parsed = suggestionSchema.safeParse(safeJsonParse(result.content));
    if (!parsed.success) {
      throw new BadRequestException(
        'A IA nao retornou um diagnostico em formato valido. Tente novamente.',
      );
    }

    if (parsed.data.sugestoes.length === 0) {
      throw new BadRequestException('A IA nao retornou nenhuma sugestao.');
    }

    const timeoutKey = findTimeoutKey(node.config);
    const sugestoes = parsed.data.sugestoes.slice(0, 3).map((suggestion) => ({
      ...suggestion,
      attempts: suggestion.attempts
        ? clamp(Math.round(suggestion.attempts), 1, 10)
        : undefined,
      backoffMs: suggestion.backoffMs
        ? clamp(Math.round(suggestion.backoffMs), 0, 60_000)
        : undefined,
      timeoutMs: suggestion.timeoutMs
        ? clamp(Math.round(suggestion.timeoutMs), 1000, 120_000)
        : undefined,
      aplicavel:
        suggestion.tipo === 'retry' ||
        (suggestion.tipo === 'timeout' && timeoutKey !== null),
    }));

    const suggestionRow = await this.suggestions.create({
      workspaceId,
      type: 'debugger',
      workflowId: execution.workflowId,
      executionId: execution.id,
      payload: {
        nodeId: node.id,
        causaProvavel: parsed.data.causaProvavel,
        sugestoes,
      },
    });

    return {
      suggestionId: suggestionRow.id,
      nodeId: node.id,
      causaProvavel: parsed.data.causaProvavel,
      sugestoes,
    };
  }

  async applySuggestion(
    workspaceId: string,
    userId: string,
    suggestionId: string,
    suggestionIndex: number,
  ) {
    const suggestionRow = await this.suggestions.findOne(
      workspaceId,
      suggestionId,
    );
    if (suggestionRow.type !== 'debugger' || !suggestionRow.workflowId) {
      throw new BadRequestException('Sugestao invalida para aplicacao.');
    }

    const payload = suggestionRow.payload as {
      nodeId: string;
      sugestoes: Array<{
        tipo: 'retry' | 'timeout' | 'fallback';
        aplicavel: boolean;
        attempts?: number;
        backoffMs?: number;
        timeoutMs?: number;
      }>;
    };
    const chosen = payload.sugestoes[suggestionIndex];
    if (!chosen || !chosen.aplicavel) {
      throw new BadRequestException(
        'Esta sugestao nao pode ser aplicada automaticamente.',
      );
    }

    const workflow = await this.workflows.findOne(
      workspaceId,
      suggestionRow.workflowId,
    );
    const currentGraph = workflow.currentVersion?.graph as unknown as
      WorkflowGraph | undefined;
    if (!currentGraph) {
      throw new BadRequestException('Fluxo sem versao atual.');
    }

    const patchedGraph: WorkflowGraph = {
      ...currentGraph,
      nodes: currentGraph.nodes.map((node) =>
        node.id === payload.nodeId ? applyPatchToNode(node, chosen) : node,
      ),
    };

    const updated = await this.workflows.saveGraph(
      workspaceId,
      suggestionRow.workflowId,
      userId,
      patchedGraph,
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

function applyPatchToNode(
  node: WorkflowNode,
  suggestion: {
    tipo: 'retry' | 'timeout' | 'fallback';
    attempts?: number;
    backoffMs?: number;
    timeoutMs?: number;
  },
): WorkflowNode {
  if (suggestion.tipo === 'retry') {
    return {
      ...node,
      retry: {
        attempts:
          suggestion.attempts ?? Math.min((node.retry?.attempts ?? 1) + 2, 10),
        backoffMs:
          suggestion.backoffMs ?? Math.max(node.retry?.backoffMs ?? 0, 1000),
      },
    };
  }
  if (suggestion.tipo === 'timeout') {
    const key = findTimeoutKey(node.config);
    if (!key || suggestion.timeoutMs === undefined) return node;
    return { ...node, config: { ...node.config, [key]: suggestion.timeoutMs } };
  }
  return node;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
