import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { getProvider, toStrictJsonSchema } from '@workflow/ai';
import { NODE_CATALOG } from '@workflow/nodes/catalog';
import type { WorkflowGraph } from '@workflow/shared';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialsService } from '../credentials/credentials.service';
import { AiSuggestionsService } from '../ai-suggestions/ai-suggestions.service';
import { workflowGraphSchema } from '../workflows/graph.schema';
import { GenerateWorkflowDto } from './dto/generate-workflow.dto';
import type { Locale } from '../i18n/pt-to-en';

const MAX_ATTEMPTS = 2;

const nodeCategorySchema = z.enum([
  'trigger',
  'logic',
  'database',
  'api',
  'file',
  'ai',
  'communication',
]);

/**
 * Schema "de frente para o LLM" — diferente do workflowGraphSchema real
 * (apps/api/src/workflows/graph.schema.ts). "config" e generico (varia por
 * tipo de node) e um JSON Schema com additionalProperties de tipo aberto
 * ("any value") e rejeitado pelo modo estrito de saida estruturada da
 * Anthropic/OpenAI ("additionalProperties: object nao suportado, use false").
 * Solucao: pedir "config" como uma STRING com JSON serializado, e fazer o
 * parse de volta pra objeto depois — assim o schema estrito so ve tipos
 * simples (string/number/array/enum), nunca um objeto de forma livre.
 */
const llmGraphSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      category: nodeCategorySchema,
      label: z.string(),
      position: z.object({ x: z.number(), y: z.number() }),
      configJson: z
        .string()
        .describe(
          'Configuracao do node serializada como JSON valido (ex.: "{\\"url\\":\\"...\\"}"). Use "{}" se o node nao precisar de config.',
        ),
    }),
  ),
  edges: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      sourceHandle: z.string().optional(),
      target: z.string(),
      targetHandle: z.string().optional(),
    }),
  ),
  viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number() }),
});

const GRAPH_JSON_SCHEMA = toStrictJsonSchema(
  z.toJSONSchema(llmGraphSchema),
) as Record<string, unknown>;

/** Converte a saida do LLM (config como string) para o formato real do grafo. */
function llmGraphToWorkflowGraph(
  llmGraph: z.infer<typeof llmGraphSchema>,
): unknown {
  return {
    ...llmGraph,
    nodes: llmGraph.nodes.map(({ configJson, ...node }) => ({
      ...node,
      config: safeJsonParse(configJson) ?? {},
    })),
  };
}

function buildSystemPrompt(locale: Locale): string {
  const catalogLines = NODE_CATALOG.map(
    (entry) =>
      `- type="${entry.type}" category="${entry.category}" (${entry.label}): ${entry.description} — outputs: [${entry.outputs.join(', ')}]`,
  ).join('\n');
  const openingLine =
    locale === 'en'
      ? 'You generate workflow graphs (n8n/Zapier-style automation) from a natural-language description, in English. Node "label" values you generate must also be in English.'
      : 'Voce gera grafos de workflow (automacao no estilo n8n/Zapier) a partir de uma descricao em linguagem natural, em portugues. Os valores de "label" dos nodes gerados tambem devem ser em portugues.';

  return `${openingLine}

Catalogo de nodes disponiveis (use APENAS estes valores exatos em "type"):
${catalogLines}

Regras obrigatorias:
- O grafo precisa ter exatamente UM node de category "trigger" (normalmente "trigger.manual" quando o disparo nao for explicito no pedido).
- Todo "id" de node deve ser unico (ex.: "n1", "n2", ...). Toda edge deve conectar ids de nodes que existem no proprio grafo.
- "configJson" de cada node e uma STRING contendo um JSON valido com a configuracao daquele node, preenchida com valores plausiveis baseados nos campos tipicos daquele tipo (ex.: node de HTTP tem url/method, node de IA tem prompt/model/provider/credential, node de banco tem query, node de comunicacao tem canal/mensagem). Quando o valor real depende de algo que so o usuario sabe (ex.: nome exato de uma credencial), deixe uma string vazia ou um placeholder claro. Se o node nao precisar de config, use "{}".
- Nao invente tipos de node fora do catalogo acima.
- Posicione os nodes da esquerda pra direita (x crescente a cada passo do fluxo, ex.: 0, 240, 480, ...), y=0, para formar um fluxo legivel.
- Retorne SOMENTE o grafo no formato pedido — nada de texto explicativo fora do JSON.`;
}

export interface GeneratedWorkflowResult {
  suggestionId: string;
  graph: WorkflowGraph;
}

@Injectable()
export class AutocompleteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
    private readonly suggestions: AiSuggestionsService,
  ) {}

  async generate(
    workspaceId: string,
    dto: GenerateWorkflowDto,
    locale: Locale = 'pt',
  ): Promise<GeneratedWorkflowResult> {
    if (dto.workflowId) {
      const workflow = await this.prisma.workflow.findFirst({
        where: { id: dto.workflowId, workspaceId },
      });
      if (!workflow) {
        throw new NotFoundException('Fluxo nao encontrado.');
      }
    }

    const apiKey =
      dto.provider === 'ollama'
        ? ''
        : await this.credentials.resolve(workspaceId, dto.credential ?? '', {
            emptyNameMessage: 'Informe a credencial do provider de IA.',
          });
    const provider = getProvider(dto.provider);
    const systemPrompt = buildSystemPrompt(locale);

    let lastError: string | null = null;
    let graph: WorkflowGraph | null = null;
    let lastResult: Awaited<ReturnType<typeof provider.chat>> | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const userContent =
        attempt === 1
          ? dto.prompt
          : `${dto.prompt}\n\nA resposta anterior era invalida pelos seguintes motivos, corrija e gere o grafo completo de novo:\n${lastError}`;

      const result = await provider.chat({
        apiKey,
        model: dto.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        // Sem temperature explicita: modelos mais novos (ex. claude-sonnet-5)
        // rejeitam customizacao de temperature ("deprecated for this model").
        // outputSchema ja restringe bastante o formato de saida de qualquer forma.
        outputSchema: GRAPH_JSON_SCHEMA,
      });
      lastResult = result;

      const parsedJson = safeJsonParse(result.content);
      if (parsedJson === undefined) {
        lastError = 'A resposta nao era um JSON valido.';
        continue;
      }

      const llmValidation = llmGraphSchema.safeParse(parsedJson);
      if (!llmValidation.success) {
        lastError = llmValidation.error.issues
          .map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
          .join('\n');
        continue;
      }

      const candidateGraph = llmGraphToWorkflowGraph(llmValidation.data);
      const validation = workflowGraphSchema.safeParse(candidateGraph);
      if (!validation.success) {
        lastError = validation.error.issues
          .map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
          .join('\n');
        continue;
      }

      graph = validation.data;
      break;
    }

    if (!graph) {
      throw new BadRequestException(
        `Nao foi possivel gerar um workflow valido a partir da descricao. Ultimo erro: ${lastError}`,
      );
    }

    const suggestion = await this.suggestions.create({
      workspaceId,
      type: 'autocomplete',
      workflowId: dto.workflowId,
      payload: { prompt: dto.prompt, graph },
      model: lastResult?.model,
      inputTokens: lastResult?.usage.inputTokens,
      outputTokens: lastResult?.usage.outputTokens,
      costUsd: lastResult?.costUsd,
    });

    return { suggestionId: suggestion.id, graph };
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
