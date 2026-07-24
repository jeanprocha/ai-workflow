import { z } from "zod";

export const aiOcrConfigSchema = z.object({
  provider: z.enum(["openai", "anthropic", "gemini", "ollama"]).default("anthropic"),
  model: z.string().min(1, "Informe o modelo (com suporte a visao)."),
  credential: z.string().default(""),
  imageUrl: z.string().min(1, "Informe a URL da imagem."),
  temperature: z.number().min(0).max(2).default(0),
  maxTokens: z.number().int().positive().default(2048),
});
export type AiOcrConfig = z.infer<typeof aiOcrConfigSchema>;

export const aiOcrMeta = {
  type: "ai.ocr",
  category: "ai",
  label: "OCR",
  description: "Extrai todo o texto legivel de uma imagem.",
  icon: "ScanText",
  outputs: ["default"],
  configSchema: aiOcrConfigSchema,
  defaultConfig: {
    provider: "anthropic",
    model: "claude-sonnet-5",
    credential: "",
    imageUrl: "",
    temperature: 0,
    maxTokens: 2048,
  } as AiOcrConfig,
} as const;
