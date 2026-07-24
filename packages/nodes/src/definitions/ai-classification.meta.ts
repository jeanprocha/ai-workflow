import { z } from "zod";

export const aiClassificationConfigSchema = z.object({
  provider: z.enum(["openai", "anthropic", "gemini", "ollama"]).default("anthropic"),
  model: z.string().min(1, "Informe o modelo."),
  credential: z.string().default(""),
  categories: z.array(z.string()).min(2, "Informe pelo menos 2 categorias."),
  text: z.string().default(""),
  temperature: z.number().min(0).max(2).default(0),
  maxTokens: z.number().int().positive().default(200),
});
export type AiClassificationConfig = z.infer<typeof aiClassificationConfigSchema>;

export const aiClassificationMeta = {
  type: "ai.classification",
  category: "ai",
  label: "Classification",
  description: "Classifica um texto em uma de varias categorias.",
  icon: "Tags",
  outputs: ["default"],
  configSchema: aiClassificationConfigSchema,
  defaultConfig: {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    credential: "",
    categories: [],
    text: "",
    temperature: 0,
    maxTokens: 200,
  } as AiClassificationConfig,
} as const;
