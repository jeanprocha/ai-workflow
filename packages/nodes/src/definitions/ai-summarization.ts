import type { NodeDefinition } from "../types.js";
import { callChat, chatToNodeResult } from "../ai-shared.js";
import { aiSummarizationMeta, type AiSummarizationConfig } from "./ai-summarization.meta.js";

export const aiSummarizationNode: NodeDefinition<AiSummarizationConfig> = {
  ...aiSummarizationMeta,
  execute: async (ctx) => {
    const text = ctx.config.text || (typeof ctx.input === "string" ? ctx.input : JSON.stringify(ctx.input));

    const result = await callChat(ctx, ctx.config, [
      {
        role: "system",
        content: `Resuma o texto do usuario em no maximo ${ctx.config.maxWords} palavras. Responda apenas com o resumo.`,
      },
      { role: "user", content: text },
    ]);

    ctx.log("ai.summarization", { model: result.model });
    return chatToNodeResult(result, result.content);
  },
};
