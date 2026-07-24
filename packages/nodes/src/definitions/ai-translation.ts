import type { NodeDefinition } from "../types.js";
import { callChat, chatToNodeResult } from "../ai-shared.js";
import { aiTranslationMeta, type AiTranslationConfig } from "./ai-translation.meta.js";

export const aiTranslationNode: NodeDefinition<AiTranslationConfig> = {
  ...aiTranslationMeta,
  execute: async (ctx) => {
    const text = ctx.config.text || (typeof ctx.input === "string" ? ctx.input : JSON.stringify(ctx.input));

    const result = await callChat(ctx, ctx.config, [
      {
        role: "system",
        content: `Traduza o texto do usuario para ${ctx.config.targetLanguage}. Responda apenas com a traducao, sem comentarios.`,
      },
      { role: "user", content: text },
    ]);

    ctx.log("ai.translation", { model: result.model, targetLanguage: ctx.config.targetLanguage });
    return chatToNodeResult(result, result.content);
  },
};
