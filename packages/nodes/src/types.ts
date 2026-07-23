import type { z } from "zod";
import type { NodeCategory } from "@workflow/shared";
import type { ExpressionContext } from "./expressions.js";

export interface NodeExecutionContext<Config = Record<string, unknown>> {
  config: Config;
  /** Payload recebido do node/edge anterior (ou o payload do trigger). */
  input: unknown;
  /** Variaveis de runtime desta execucao (Set Variables escreve aqui). */
  vars: Record<string, unknown>;
  /** Log estruturado — persistido em execution_logs. */
  log: (event: string, payload?: unknown) => void;
}

export interface NodeExecutionResult {
  output: unknown;
  /** Nome do branch de saida tomado (ex.: "true"/"false" no node If). Edges sem sourceHandle sempre disparam. */
  branch?: string;
  /** Mutacoes nas variaveis de runtime (mescladas no contexto da execucao). */
  varsPatch?: Record<string, unknown>;
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
