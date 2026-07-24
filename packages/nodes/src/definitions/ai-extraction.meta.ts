import { z } from "zod";

export const aiExtractionConfigSchema = z.object({
  provider: z.enum(["openai", "anthropic", "gemini", "ollama"]).default("anthropic"),
  model: z.string().min(1, "Informe o modelo."),
  credential: z.string().default(""),
  text: z.string().default(""),
  schema: z.record(z.string(), z.unknown()),
  temperature: z.number().min(0).max(2).default(0),
  maxTokens: z.number().int().positive().default(1024),
});
export type AiExtractionConfig = z.infer<typeof aiExtractionConfigSchema>;

export const aiExtractionMeta = {
  type: "ai.extraction",
  category: "ai",
  label: "Extraction",
  description: "Extrai dados estruturados de um texto, seguindo um JSON Schema.",
  icon: "ScanSearch",
  outputs: ["default"],
  configSchema: aiExtractionConfigSchema,
  defaultConfig: {
    provider: "anthropic",
    model: "claude-sonnet-5",
    credential: "",
    text: "",
    schema: { type: "object", properties: {} },
    temperature: 0,
    maxTokens: 1024,
  } as AiExtractionConfig,
} as const;
