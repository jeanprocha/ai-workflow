import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { randomUUID } from 'crypto';

/** Compare-and-delete: so libera se o token bater — evita derrubar o lock de outro dono apos o TTL expirar. */
const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/**
 * Cache generico em Redis para agregados caros (Dashboard/Analytics).
 * Reaproveita a mesma instancia Redis do BullMQ (ver queue.module.ts).
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly client = new Redis(
    process.env.REDIS_URL ?? 'redis://localhost:6379',
  );

  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    compute: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.client.get(key);
    if (cached !== null) return JSON.parse(cached) as T;

    const value = await compute();
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    return value;
  }

  /** Escrita direta (sem compute) — usado pelo heartbeat do worker (observability/). */
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /** @throws se o Redis nao responder — usado por GET /health/ready. */
  async ping(): Promise<void> {
    await this.client.ping();
  }

  /**
   * Lock leve (SET NX EX) — nao e Redlock, e suficiente pra contencao baixa
   * (renovacao de token oauth, spec-oauth-credencial.md). Devolve um token
   * de posse pra releaseLock so derrubar o proprio lock, nunca o de outro
   * dono cujo TTL ja passou.
   */
  async acquireLock(key: string, ttlSeconds: number): Promise<string | null> {
    const token = randomUUID();
    const result = await this.client.set(key, token, 'EX', ttlSeconds, 'NX');
    return result === 'OK' ? token : null;
  }

  async releaseLock(key: string, token: string): Promise<void> {
    await this.client.eval(RELEASE_LOCK_SCRIPT, 1, key, token);
  }

  onModuleDestroy() {
    this.client.disconnect();
  }
}
