import { getProvider, type ChatMessage, type ChatResult } from "@workflow/ai";
import { z } from "zod";
import type { NodeExecutionResult } from "./types.js";

export const aiProviderSchema = z.enum(["openai", "anthropic", "gemini", "ollama"]);

export const AI_COMMON_CONFIG = {
  provider: aiProviderSchema.default("anthropic"),
  model: z.string().min(1, "Informe o modelo."),
  credential: z.string().default(""),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().positive().default(1024),
};

export interface AiCommonConfig {
  provider: z.infer<typeof aiProviderSchema>;
  model: string;
  credential: string;
  temperature: number;
  maxTokens: number;
}

export async function callChat(
  ctx: { getCredential: (name: string) => Promise<string> },
  config: AiCommonConfig,
  messages: ChatMessage[],
  outputSchema?: Record<string, unknown>,
): Promise<ChatResult> {
  const apiKey = config.provider === "ollama" ? "" : await ctx.getCredential(config.credential);
  const provider = getProvider(config.provider);
  return provider.chat({
    apiKey,
    model: config.model,
    messages,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    outputSchema,
  });
}

export function chatToNodeResult(result: ChatResult, output: unknown): NodeExecutionResult {
  return {
    output,
    usage: {
      tokens: result.usage.inputTokens + result.usage.outputTokens,
      model: result.model,
      costUsd: result.costUsd,
    },
  };
}
