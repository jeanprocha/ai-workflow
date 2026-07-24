import { z } from "zod";

export const aiEmbeddingsConfigSchema = z.object({
  provider: z.enum(["openai", "gemini", "ollama"]).default("openai"),
  model: z.string().min(1, "Informe o modelo de embeddings."),
  credential: z.string().default(""),
  text: z.string().default(""),
});
export type AiEmbeddingsConfig = z.infer<typeof aiEmbeddingsConfigSchema>;

export const aiEmbeddingsMeta = {
  type: "ai.embeddings",
  category: "ai",
  label: "Embeddings",
  description: "Gera o vetor de embedding de um texto (usado pela Knowledge Base).",
  icon: "Blocks",
  outputs: ["default"],
  configSchema: aiEmbeddingsConfigSchema,
  defaultConfig: {
    provider: "openai",
    model: "text-embedding-3-small",
    credential: "",
    text: "",
  } as AiEmbeddingsConfig,
} as const;
