import { z } from "zod";

export const aiVisionConfigSchema = z.object({
  provider: z.enum(["openai", "anthropic", "gemini", "ollama"]).default("anthropic"),
  model: z.string().min(1, "Informe o modelo (com suporte a visao)."),
  credential: z.string().default(""),
  imageUrl: z.string().min(1, "Informe a URL da imagem."),
  prompt: z.string().default("Descreva esta imagem em detalhes."),
  temperature: z.number().min(0).max(2).default(0.3),
  maxTokens: z.number().int().positive().default(1024),
});
export type AiVisionConfig = z.infer<typeof aiVisionConfigSchema>;

export const aiVisionMeta = {
  type: "ai.vision",
  category: "ai",
  label: "Vision",
  description: "Analisa uma imagem com um modelo multimodal.",
  icon: "Eye",
  outputs: ["default"],
  configSchema: aiVisionConfigSchema,
  defaultConfig: {
    provider: "anthropic",
    model: "claude-sonnet-5",
    credential: "",
    imageUrl: "",
    prompt: "Descreva esta imagem em detalhes.",
    temperature: 0.3,
    maxTokens: 1024,
  } as AiVisionConfig,
} as const;
