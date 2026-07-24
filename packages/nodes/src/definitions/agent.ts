import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const configSchema = z.object({
  agentId: z.string().min(1, "Selecione um agente."),
  message: z.string().default(""),
});
type Config = z.infer<typeof configSchema>;

export const agentNode: NodeDefinition<Config> = {
  type: "ai.agent",
  category: "ai",
  label: "Agent",
  description: "Usa um agente reutilizavel do workspace (com suas tools e memoria) dentro do fluxo.",
  icon: "Bot",
  outputs: ["default"],
  configSchema,
  defaultConfig: { agentId: "", message: "" },
  execute: async (ctx) => {
    const message = ctx.config.message || (typeof ctx.input === "string" ? ctx.input : JSON.stringify(ctx.input));
    const result = await ctx.callAgent(ctx.config.agentId, message);
    ctx.log("ai.agent", { agentId: ctx.config.agentId, tokens: result.tokens });
    return {
      output: result.content,
      usage: { tokens: result.tokens, model: ctx.config.agentId, costUsd: result.costUsd },
    };
  },
};
