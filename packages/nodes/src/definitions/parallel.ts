import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const configSchema = z.object({});
type Config = z.infer<typeof configSchema>;

/**
 * Fan-out: dispara os 3 branches ao mesmo tempo com o mesmo input. A engine
 * executa nodes de uma mesma "onda" concorrentemente (Promise.all), entao os
 * 3 caminhos rodam em paralelo de verdade, nao apenas em sequencia.
 */
export const parallelNode: NodeDefinition<Config> = {
  type: "logic.parallel",
  category: "logic",
  label: "Parallel",
  description: "Executa ate 3 caminhos em paralelo a partir do mesmo dado.",
  icon: "Split",
  outputs: ["1", "2", "3"],
  configSchema,
  defaultConfig: {},
  execute: (ctx) => ({ output: ctx.input, branches: ["1", "2", "3"] }),
};
