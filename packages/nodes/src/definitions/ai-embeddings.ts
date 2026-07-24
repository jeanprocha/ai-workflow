import { getProvider } from "@workflow/ai";
import type { NodeDefinition } from "../types.js";
import { aiEmbeddingsMeta, type AiEmbeddingsConfig } from "./ai-embeddings.meta.js";

export const aiEmbeddingsNode: NodeDefinition<AiEmbeddingsConfig> = {
  ...aiEmbeddingsMeta,
  execute: async (ctx) => {
    const text = ctx.config.text || (typeof ctx.input === "string" ? ctx.input : JSON.stringify(ctx.input));
    const apiKey =
      ctx.config.provider === "ollama" ? "" : await ctx.getCredential(ctx.config.credential);

    const provider = getProvider(ctx.config.provider);
    const result = await provider.embed({ apiKey, model: ctx.config.model, input: text });

    ctx.log("ai.embeddings", { model: result.model, dimensions: result.embeddings[0]?.length ?? 0 });
    return {
      output: { embedding: result.embeddings[0] ?? [] },
      usage: { tokens: result.usage.tokens, model: result.model, costUsd: result.costUsd },
    };
  },
};
