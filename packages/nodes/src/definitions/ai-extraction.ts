import type { NodeDefinition } from "../types.js";
import { callChat, chatToNodeResult } from "../ai-shared.js";
import { aiExtractionMeta, type AiExtractionConfig } from "./ai-extraction.meta.js";

export const aiExtractionNode: NodeDefinition<AiExtractionConfig> = {
  ...aiExtractionMeta,
  execute: async (ctx) => {
    const text = ctx.config.text || (typeof ctx.input === "string" ? ctx.input : JSON.stringify(ctx.input));

    const result = await callChat(
      ctx,
      ctx.config,
      [
        {
          role: "system",
          content: "Extraia os dados do texto do usuario seguindo exatamente o schema fornecido.",
        },
        { role: "user", content: text },
      ],
      ctx.config.schema,
    );

    ctx.log("ai.extraction", { model: result.model });
    const parsed: unknown = JSON.parse(result.content);
    return chatToNodeResult(result, parsed);
  },
};
