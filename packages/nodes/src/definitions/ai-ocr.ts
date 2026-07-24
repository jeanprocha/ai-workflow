import type { NodeDefinition } from "../types.js";
import { callChat, chatToNodeResult } from "../ai-shared.js";
import { aiOcrMeta, type AiOcrConfig } from "./ai-ocr.meta.js";

const OCR_PROMPT =
  "Extraia todo o texto visivel nesta imagem, verbatim, na ordem em que aparece. Responda apenas com o texto extraido, sem comentarios.";

export const aiOcrNode: NodeDefinition<AiOcrConfig> = {
  ...aiOcrMeta,
  execute: async (ctx) => {
    const result = await callChat(ctx, ctx.config, [
      { role: "user", content: OCR_PROMPT, imageUrl: ctx.config.imageUrl },
    ]);

    ctx.log("ai.ocr", { model: result.model });
    return chatToNodeResult(result, result.content);
  },
};
