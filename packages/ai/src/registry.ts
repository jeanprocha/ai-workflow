import type { AIProvider } from "./types.js";
import { anthropicProvider } from "./providers/anthropic.js";
import { openaiProvider } from "./providers/openai.js";
import { geminiProvider } from "./providers/gemini.js";
import { ollamaProvider } from "./providers/ollama.js";

const PROVIDERS: Record<string, AIProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  gemini: geminiProvider,
  ollama: ollamaProvider,
};

export function getProvider(name: string): AIProvider {
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`Provider de IA desconhecido: ${name}`);
  }
  return provider;
}
