import { z } from "zod";

export const aiChatConfigSchema = z.object({
  provider: z.enum(["openai", "anthropic", "gemini", "ollama"]).default("anthropic"),
  model: z.string().min(1, "Informe o modelo."),
  credential: z.string().default(""),
  systemPrompt: z.string().default(""),
  prompt: z.string().default(""),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().positive().default(1024),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
});
export type AiChatConfig = z.infer<typeof aiChatConfigSchema>;

export const aiChatMeta = {
  type: "ai.chat",
  category: "ai",
  label: "Chat",
  description: "Envia um prompt para um modelo de IA (qualquer provider) e retorna a resposta.",
  icon: "Sparkles",
  outputs: ["default"],
  configSchema: aiChatConfigSchema,
  defaultConfig: {
    provider: "anthropic",
    model: "claude-sonnet-5",
    credential: "",
    systemPrompt: "",
    prompt: "",
    temperature: 0.7,
    maxTokens: 1024,
  } as AiChatConfig,
} as const;
