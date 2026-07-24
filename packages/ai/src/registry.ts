import type { AIProvider } from "./types.js";
import { anthropicProvider } from "./providers/anthropic.js";
import { openaiProvider } from "./providers/openai.js";
import { geminiProvider } from "./providers/gemini.js";
import { ollamaProvider } from "./providers/ollama.js";
import { acquireProviderSlot } from "./rate-limiter.js";

const PROVIDERS: Record<string, AIProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  gemini: geminiProvider,
  ollama: ollamaProvider,
};

/**
 * Todo node de IA e agente chama getProvider() (nunca os providers direto) —
 * isso da um unico ponto para aplicar rate limiting por provider (Fase 10),
 * sem tocar em cada node/agente individualmente.
 */
function withRateLimit(provider: AIProvider): AIProvider {
  return {
    name: provider.name,
    chat: async (options) => {
      await acquireProviderSlot(provider.name);
      return provider.chat(options);
    },
    embed: async (options) => {
      await acquireProviderSlot(provider.name);
      return provider.embed(options);
    },
  };
}

export function getProvider(name: string): AIProvider {
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`Provider de IA desconhecido: ${name}`);
  }
  return withRateLimit(provider);
}
