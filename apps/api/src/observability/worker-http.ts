import * as http from 'node:http';
import type { INestApplicationContext } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';

const CHECK_TIMEOUT_MS = 1500;

interface CheckResult {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout apos ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function runCheck(fn: () => Promise<void>): Promise<CheckResult> {
  const startedAt = Date.now();
  try {
    await withTimeout(fn(), CHECK_TIMEOUT_MS);
    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  metrics: MetricsService,
  prisma: PrismaService,
  cache: CacheService,
): Promise<void> {
  const url = req.url ?? '';

  if (url.startsWith('/metrics')) {
    res.setHeader('Content-Type', metrics.registry.contentType);
    res.end(await metrics.registry.metrics());
    return;
  }

  if (url.startsWith('/health')) {
    const [postgres, redis] = await Promise.all([
      runCheck(async () => {
        await prisma.$queryRaw`SELECT 1`;
      }),
      runCheck(async () => {
        await cache.ping();
      }),
    ]);
    const ok = postgres.ok && redis.ok;
    res.statusCode = ok ? 200 : 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        status: ok ? 'ok' : 'degraded',
        service: 'worker',
        timestamp: new Date().toISOString(),
        checks: { postgres, redis },
      }),
    );
    return;
  }

  res.statusCode = 404;
  res.end('Not found');
}

/**
 * Mini servidor HTTP puro (node:http, sem Express/NestJS) — o worker roda via
 * createApplicationContext, sem adapter HTTP proprio. So expoe o essencial
 * pro Railway/Prometheus: /metrics e /health. Porta: WORKER_PORT ?? PORT ??
 * 3334 — Railway injeta PORT em todo servico do projeto, inclusive worker.
 */
export function startWorkerHttpServer(
  app: INestApplicationContext,
): http.Server {
  const metrics = app.get(MetricsService);
  const prisma = app.get(PrismaService);
  const cache = app.get(CacheService);

  const server = http.createServer((req, res) => {
    void handleRequest(req, res, metrics, prisma, cache);
  });

  const port = Number(process.env.WORKER_PORT ?? process.env.PORT ?? 3334);
  server.listen(port);
  return server;
}
