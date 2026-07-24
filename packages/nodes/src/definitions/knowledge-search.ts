import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const configSchema = z.object({
  knowledgeBaseId: z.string().min(1, "Selecione uma base de conhecimento."),
  query: z.string().default(""),
  topK: z.number().int().min(1).max(20).default(5),
  threshold: z.number().min(0).max(1).default(0),
});
type Config = z.infer<typeof configSchema>;

export const knowledgeSearchNode: NodeDefinition<Config> = {
  type: "knowledge.search",
  category: "ai",
  label: "Knowledge Search",
  description: "Busca semantica numa base de conhecimento do workspace (RAG).",
  icon: "Search",
  outputs: ["default"],
  configSchema,
  defaultConfig: { knowledgeBaseId: "", query: "", topK: 5, threshold: 0 },
  execute: async (ctx) => {
    const query =
      ctx.config.query || (typeof ctx.input === "string" ? ctx.input : JSON.stringify(ctx.input));
    const results = await ctx.searchKnowledge(ctx.config.knowledgeBaseId, query, {
      topK: ctx.config.topK,
      threshold: ctx.config.threshold,
    });
    ctx.log("knowledge.search", { resultCount: results.length });
    return { output: { results } };
  },
};
