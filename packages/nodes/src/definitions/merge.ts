import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const configSchema = z.object({});
type Config = z.infer<typeof configSchema>;

/**
 * Join: a engine so executa este node quando TODAS as edges de entrada
 * completarem, entregando um array com os outputs de cada uma como input.
 */
export const mergeNode: NodeDefinition<Config> = {
  type: "logic.merge",
  category: "logic",
  label: "Merge",
  description: "Aguarda todos os caminhos anteriores e junta os resultados em um array.",
  icon: "GitMerge",
  outputs: ["default"],
  configSchema,
  defaultConfig: {},
  execute: (ctx) => ({ output: ctx.input }),
};
