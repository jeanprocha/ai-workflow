import type { NodeDefinition } from "../types.js";
import { callChat, chatToNodeResult } from "../ai-shared.js";
import { aiVisionMeta, type AiVisionConfig } from "./ai-vision.meta.js";

export const aiVisionNode: NodeDefinition<AiVisionConfig> = {
  ...aiVisionMeta,
  execute: async (ctx) => {
    const result = await callChat(ctx, ctx.config, [
      { role: "user", content: ctx.config.prompt, imageUrl: ctx.config.imageUrl },
    ]);

    ctx.log("ai.vision", { model: result.model });
    return chatToNodeResult(result, result.content);
  },
};
