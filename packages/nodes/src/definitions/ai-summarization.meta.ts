import { z } from "zod";

export const aiSummarizationConfigSchema = z.object({
  provider: z.enum(["openai", "anthropic", "gemini", "ollama"]).default("anthropic"),
  model: z.string().min(1, "Informe o modelo."),
  credential: z.string().default(""),
  text: z.string().default(""),
  maxWords: z.number().int().positive().default(100),
  temperature: z.number().min(0).max(2).default(0.3),
  maxTokens: z.number().int().positive().default(1024),
});
export type AiSummarizationConfig = z.infer<typeof aiSummarizationConfigSchema>;

export const aiSummarizationMeta = {
  type: "ai.summarization",
  category: "ai",
  label: "Summarization",
  description: "Resume um texto em ate N palavras.",
  icon: "FileDigit",
  outputs: ["default"],
  configSchema: aiSummarizationConfigSchema,
  defaultConfig: {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    credential: "",
    text: "",
    maxWords: 100,
    temperature: 0.3,
    maxTokens: 1024,
  } as AiSummarizationConfig,
} as const;
