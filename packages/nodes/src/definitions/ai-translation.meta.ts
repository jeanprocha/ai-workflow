import { z } from "zod";

export const aiTranslationConfigSchema = z.object({
  provider: z.enum(["openai", "anthropic", "gemini", "ollama"]).default("anthropic"),
  model: z.string().min(1, "Informe o modelo."),
  credential: z.string().default(""),
  targetLanguage: z.string().min(1, "Informe o idioma de destino, ex: ingles."),
  text: z.string().default(""),
  temperature: z.number().min(0).max(2).default(0.3),
  maxTokens: z.number().int().positive().default(2048),
});
export type AiTranslationConfig = z.infer<typeof aiTranslationConfigSchema>;

export const aiTranslationMeta = {
  type: "ai.translation",
  category: "ai",
  label: "Translation",
  description: "Traduz um texto para o idioma indicado.",
  icon: "Languages",
  outputs: ["default"],
  configSchema: aiTranslationConfigSchema,
  defaultConfig: {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    credential: "",
    targetLanguage: "ingles",
    text: "",
    temperature: 0.3,
    maxTokens: 2048,
  } as AiTranslationConfig,
} as const;
