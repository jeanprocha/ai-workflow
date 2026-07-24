import type { NodeDefinition } from "../types.js";
import { callChat, chatToNodeResult } from "../ai-shared.js";
import { aiChatMeta, type AiChatConfig } from "./ai-chat.meta.js";

export const aiChatNode: NodeDefinition<AiChatConfig> = {
  ...aiChatMeta,
  execute: async (ctx) => {
    const userContent = ctx.config.prompt || (typeof ctx.input === "string" ? ctx.input : JSON.stringify(ctx.input));

    const result = await callChat(
      ctx,
      ctx.config,
      [
        ...(ctx.config.systemPrompt
          ? [{ role: "system" as const, content: ctx.config.systemPrompt }]
          : []),
        { role: "user" as const, content: userContent },
      ],
      ctx.config.outputSchema,
    );

    ctx.log("ai.chat", { model: result.model, tokens: result.usage.inputTokens + result.usage.outputTokens });

    const output = ctx.config.outputSchema ? safeJsonParse(result.content) : result.content;
    return chatToNodeResult(result, output);
  },
};

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
