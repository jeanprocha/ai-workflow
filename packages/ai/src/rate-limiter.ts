import { Redis } from "ioredis";

let client: Redis | null = null;

function getClient(): Redis {
  if (!client) {
    client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
  }
  return client;
}

const DEFAULT_REQUESTS_PER_MINUTE: Record<string, number> = {
  openai: 60,
  anthropic: 60,
  gemini: 60,
  ollama: 600,
};

function limitFor(provider: string): number {
  const envKey = `AI_RATE_LIMIT_${provider.toUpperCase()}_RPM`;
  const raw = process.env[envKey];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : (DEFAULT_REQUESTS_PER_MINUTE[provider] ?? 60);
}

const WINDOW_SECONDS = 60;
const MAX_WAIT_MS = 30_000;
const POLL_INTERVAL_MS = 250;

/**
 * Rate limiting/backpressure distribuido por provider de IA (Fase 10).
 * Usa Redis (janela fixa de 60s) em vez de um contador em memoria: com
 * multiplos workers concorrentes rodando ao mesmo tempo, um limiter em
 * memoria subestimaria o uso real (cada processo teria seu proprio contador,
 * multiplicando o limite efetivo pelo numero de workers). O Redis e o unico
 * estado compartilhado que todos os processos ja enxergam.
 */
export async function acquireProviderSlot(provider: string): Promise<void> {
  const limit = limitFor(provider);
  const redis = getClient();
  const startedAt = Date.now();

  for (;;) {
    const windowId = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
    const key = `ai-rate:${provider}:${windowId}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, WINDOW_SECONDS + 5);
    }
    if (count <= limit) return;

    if (Date.now() - startedAt > MAX_WAIT_MS) {
      throw new Error(
        `Limite de taxa do provider "${provider}" excedido (${limit} req/min). Tente novamente em instantes.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

export function closeRateLimiterConnection(): void {
  client?.disconnect();
  client = null;
}
