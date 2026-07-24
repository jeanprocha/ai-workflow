import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

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

  onModuleDestroy() {
    this.client.disconnect();
  }
}
