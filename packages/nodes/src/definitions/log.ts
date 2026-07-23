import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const configSchema = z.object({
  message: z.string().default(""),
});
type Config = z.infer<typeof configSchema>;

export const logNode: NodeDefinition<Config> = {
  type: "logic.log",
  category: "logic",
  label: "Log",
  description: "Registra uma mensagem (ou o dado recebido) nos logs da execucao.",
  icon: "Terminal",
  outputs: ["default"],
  configSchema,
  defaultConfig: { message: "" },
  execute: (ctx) => {
    const value = ctx.config.message || ctx.input;
    ctx.log("log", { value });
    return { output: value };
  },
};
