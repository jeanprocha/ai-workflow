export interface ModelInfo {
  id: string;
  provider: "openai" | "anthropic" | "gemini" | "ollama";
  label: string;
  contextWindow: number;
  /** USD por 1M tokens de entrada/saida. Ollama roda local: custo 0. */
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  vision: boolean;
  /**
   * Classificacao aproximada de capacidade (nao ha um score real disponivel
   * dos providers) — usada pelo AI Cost Optimizer (Fase 11) pra so sugerir
   * troca por um modelo de tier igual ou inferior, nunca "pra cima".
   */
  tier: "flagship" | "standard" | "economy";
}

/**
 * Precos ilustrativos (ordem de grandeza real, mas sujeitos a mudar).
 * Usado para contabilizar custo por execucao e para o AI Cost Optimizer (Fase 11).
 */
export const MODEL_REGISTRY: readonly ModelInfo[] = [
  {
    id: "claude-opus-4-8",
    provider: "anthropic",
    label: "Claude Opus 4.8",
    contextWindow: 200_000,
    inputPricePerMillion: 15,
    outputPricePerMillion: 75,
    vision: true,
    tier: "flagship",
  },
  {
    id: "claude-sonnet-5",
    provider: "anthropic",
    label: "Claude Sonnet 5",
    contextWindow: 200_000,
    inputPricePerMillion: 3,
    outputPricePerMillion: 15,
    vision: true,
    tier: "standard",
  },
  {
    id: "claude-haiku-4-5-20251001",
    provider: "anthropic",
    label: "Claude Haiku 4.5",
    contextWindow: 200_000,
    inputPricePerMillion: 0.8,
    outputPricePerMillion: 4,
    vision: true,
    tier: "economy",
  },
  {
    id: "gpt-5",
    provider: "openai",
    label: "GPT-5",
    contextWindow: 128_000,
    inputPricePerMillion: 5,
    outputPricePerMillion: 15,
    vision: true,
    tier: "flagship",
  },
  {
    id: "gpt-5-mini",
    provider: "openai",
    label: "GPT-5 Mini",
    contextWindow: 128_000,
    inputPricePerMillion: 0.6,
    outputPricePerMillion: 2.4,
    vision: true,
    tier: "economy",
  },
  {
    id: "gemini-2.5-pro",
    provider: "gemini",
    label: "Gemini 2.5 Pro",
    contextWindow: 1_000_000,
    inputPricePerMillion: 1.25,
    outputPricePerMillion: 5,
    vision: true,
    tier: "flagship",
  },
  {
    id: "gemini-2.5-flash",
    provider: "gemini",
    label: "Gemini 2.5 Flash",
    contextWindow: 1_000_000,
    inputPricePerMillion: 0.15,
    outputPricePerMillion: 0.6,
    vision: true,
    tier: "economy",
  },
  {
    id: "llama3.1",
    provider: "ollama",
    label: "Llama 3.1 (local)",
    contextWindow: 128_000,
    inputPricePerMillion: 0,
    outputPricePerMillion: 0,
    vision: false,
    tier: "economy",
  },
] as const;

export function getModelInfo(modelId: string): ModelInfo | undefined {
  return MODEL_REGISTRY.find((model) => model.id === modelId);
}

export function estimateCostUsd(modelId: string, inputTokens: number, outputTokens: number): number {
  const model = getModelInfo(modelId);
  if (!model) return 0;
  return (
    (inputTokens / 1_000_000) * model.inputPricePerMillion +
    (outputTokens / 1_000_000) * model.outputPricePerMillion
  );
}
