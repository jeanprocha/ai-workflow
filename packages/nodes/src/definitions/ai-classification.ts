import type { NodeDefinition } from "../types.js";
import { callChat, chatToNodeResult } from "../ai-shared.js";
import { aiClassificationMeta, type AiClassificationConfig } from "./ai-classification.meta.js";

export const aiClassificationNode: NodeDefinition<AiClassificationConfig> = {
  ...aiClassificationMeta,
  execute: async (ctx) => {
    const text = ctx.config.text || (typeof ctx.input === "string" ? ctx.input : JSON.stringify(ctx.input));

    const result = await callChat(
      ctx,
      ctx.config,
      [
        {
          role: "system",
          content: `Classifique o texto do usuario em exatamente uma destas categorias: ${ctx.config.categories.join(", ")}.`,
        },
        { role: "user", content: text },
      ],
      {
        type: "object",
        properties: { category: { type: "string", enum: ctx.config.categories } },
        required: ["category"],
      },
    );

    ctx.log("ai.classification", { model: result.model });
    const parsed = JSON.parse(result.content) as { category: string };
    return chatToNodeResult(result, parsed);
  },
};
