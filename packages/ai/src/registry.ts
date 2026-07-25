import type { AIProvider } from "./types.js";
import { anthropicProvider } from "./providers/anthropic.js";
import { openaiProvider } from "./providers/openai.js";
import { geminiProvider } from "./providers/gemini.js";
import { ollamaProvider } from "./providers/ollama.js";
import { acquireProviderSlot } from "./rate-limiter.js";
import { emitTelemetry } from "./telemetry.js";

const PROVIDERS: Record<string, AIProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  gemini: geminiProvider,
  ollama: ollamaProvider,
};

/**
 * Todo node de IA e agente chama getProvider() (nunca os providers direto) —
 * isso da um unico ponto para aplicar rate limiting (Fase 10) e telemetria
 * (Fase 5, ver telemetry.ts) por provider, sem tocar em cada node/agente
 * individualmente. Emite evento tanto no sucesso quanto na falha — uma
 * chamada que sempre falha (credencial invalida, provider fora do ar) e
 * exatamente o tipo de coisa que a telemetria precisa capturar.
 */
function withInstrumentation(provider: AIProvider): AIProvider {
  return {
    name: provider.name,
    chat: async (options) => {
      const waitMs = await acquireProviderSlot(provider.name);
      const startedAt = Date.now();
      try {
        const result = await provider.chat(options);
        emitTelemetry({
          provider: provider.name,
          operation: "chat",
          model: result.model,
          durationMs: Date.now() - startedAt,
          waitMs,
          usage: result.usage,
          costUsd: result.costUsd,
          ok: true,
        });
        return result;
      } catch (error) {
        emitTelemetry({
          provider: provider.name,
          operation: "chat",
          model: options.model,
          durationMs: Date.now() - startedAt,
          waitMs,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    embed: async (options) => {
      const waitMs = await acquireProviderSlot(provider.name);
      const startedAt = Date.now();
      try {
        const result = await provider.embed(options);
        emitTelemetry({
          provider: provider.name,
          operation: "embed",
          model: result.model,
          durationMs: Date.now() - startedAt,
          waitMs,
          usage: result.usage,
          costUsd: result.costUsd,
          ok: true,
        });
        return result;
      } catch (error) {
        emitTelemetry({
          provider: provider.name,
          operation: "embed",
          model: options.model,
          durationMs: Date.now() - startedAt,
          waitMs,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  };
}

export function getProvider(name: string): AIProvider {
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`Provider de IA desconhecido: ${name}`);
  }
  return withInstrumentation(provider);
}
