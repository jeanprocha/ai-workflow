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
