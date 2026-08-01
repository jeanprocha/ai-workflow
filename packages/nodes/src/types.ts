import type { z } from "zod";
import type { NodeCategory } from "@workflow/shared";
import type { ExpressionContext } from "./expressions.js";

export type NodeLogLevel = "debug" | "info" | "warn" | "error";

export interface NodeExecutionContext<Config = Record<string, unknown>> {
  config: Config;
  /** Payload recebido do node/edge anterior (ou o payload do trigger). */
  input: unknown;
  /** Variaveis de runtime desta execucao (Set Variables escreve aqui). */
  vars: Record<string, unknown>;
  /** Log estruturado — persistido em execution_logs e espelhado em stdout. Default de `level`: "info". */
  log: (event: string, payload?: unknown, level?: NodeLogLevel) => void;
  /** Busca o valor descriptografado de uma credencial do workspace pelo nome. */
  getCredential: (name: string) => Promise<string>;
  /** Conversa com um agente do workspace (node Agent) — roda o loop agentico completo. */
  callAgent: (
    agentId: string,
    message: string,
  ) => Promise<{ content: string; tokens: number; costUsd: number }>;
  /** Busca semantica numa base de conhecimento do workspace (node Knowledge Search). */
  searchKnowledge: (
    knowledgeBaseId: string,
    query: string,
    opts?: { topK?: number; threshold?: number },
  ) => Promise<
    Array<{
      documentName: string;
      content: string;
      similarity: number;
    }>
  >;
  /** Invoca uma tool de um servidor MCP conectado do workspace (node MCP Tool). */
  callMcpTool: (
    mcpServerId: string,
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
  /**
   * Envia uma mensagem ao visitante da conversa atual (node Chat Reply).
   * So funciona numa execucao disparada por trigger.chat — a engine grava a
   * mensagem em conversation_messages e, para canais externos futuros
   * (WhatsApp etc.), tambem faria a chamada ao provedor. Fora de uma
   * execucao de chat (sem conversationId no input do trigger), a engine
   * rejeita com erro claro — mais util para quem monta o fluxo do que um
   * no-op silencioso que nunca entrega a mensagem.
   */
  sendChatMessage: (content: string) => Promise<void>;
  /**
   * Cria a pendencia de aprovacao (H2-06) e devolve o link publico de
   * decisao — o proprio node e quem avisa o aprovador (ex.: por e-mail),
   * a engine so persiste a linha. Chamar de novo com o mesmo executionId/
   * nodeId (retry apos o sandbox morrer pos-RPC) ROTACIONA o token: o link
   * anterior, se chegou a ser enviado, para de valer.
   */
  requestApproval: (params: {
    title: string;
    timeoutHours: number;
    onTimeout: "approve" | "reject";
  }) => Promise<{ approvalId: string; url: string }>;
  /**
   * Preenchido pela engine SO na retomada apos uma pausa (`suspend` na
   * chamada anterior deste mesmo node): o dado da decisao (ex.: aprovado?
   * comentario?). `undefined` na primeira passada — e o sinal que o node usa
   * pra saber se deve suspender ou processar a decisao (H2-06).
   */
  resumeData?: unknown;
}

/**
 * Sinal generico de pausa (H2-06) — a engine NUNCA interpreta o conteudo,
 * so usa `ref` pra reidentificar o node na retomada e loga/emite `reason`/
 * `label`. Quem da semantica a pausa (ex.: "e uma aprovacao humana") e o
 * node, via o RPC que ele chamou antes de devolver o suspend.
 */
export interface SuspendDescriptor {
  /** Por que suspendeu — vira log/evento, nunca interpretado pela engine. */
  reason: string;
  /** Identificador da pendencia no dominio do node (ex.: id da Approval). */
  ref: string;
  /** Rotulo curto pra UI (ex.: titulo da aprovacao). */
  label?: string;
}

export interface NodeExecutionResult {
  output: unknown;
  /**
   * Nomes dos branches de saida disparados (ex.: ["true"] no If, ["1","2","3"]
   * no Parallel — todos ao mesmo tempo). Edges sem sourceHandle sempre disparam,
   * independente deste campo.
   */
  branches?: string[];
  /** Mutacoes nas variaveis de runtime (mescladas no contexto da execucao). */
  varsPatch?: Record<string, unknown>;
  /** Nodes de IA preenchem isto — a engine grava em execution_steps e soma no total da execucao. */
  usage?: { tokens: number; model: string; costUsd: number };
  /**
   * Presente = "pausar aqui" (H2-06). A engine nao roteia nada a partir
   * deste node ate a retomada; `output`/`branches`/`varsPatch` sao
   * ignorados quando `suspend` esta presente.
   */
  suspend?: SuspendDescriptor;
}

export interface NodeDefinition<Config = Record<string, unknown>> {
  type: string;
  category: NodeCategory;
  label: string;
  description: string;
  /** Nome do icone lucide-react usado na paleta do editor. */
  icon: string;
  /** Nomes dos outputs possiveis, na ordem exibida no canvas. */
  outputs: readonly string[];
  configSchema: z.ZodType<Config>;
  defaultConfig: Config;
  execute: (ctx: NodeExecutionContext<Config>) => Promise<NodeExecutionResult> | NodeExecutionResult;
}

export type { ExpressionContext };
