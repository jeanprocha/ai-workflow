import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const configSchema = z.object({
  ms: z.number().int().min(0).max(300_000).default(1000),
});
type Config = z.infer<typeof configSchema>;

export const delayNode: NodeDefinition<Config> = {
  type: "logic.delay",
  category: "logic",
  label: "Delay",
  description: "Aguarda um tempo fixo antes de continuar o fluxo.",
  icon: "Clock",
  outputs: ["default"],
  configSchema,
  defaultConfig: { ms: 1000 },
  execute: async (ctx) => {
    await new Promise((resolve) => setTimeout(resolve, ctx.config.ms));
    return { output: ctx.input };
  },
};
