import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { HEARTBEAT_KEY } from '../worker/worker-heartbeat.service';
import {
  EXECUTIONS_QUEUE,
  INGESTION_QUEUE,
  MCP_HEALTH_QUEUE,
  SCHEDULES_QUEUE,
} from '../queue/queue.module';

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

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    @InjectQueue(EXECUTIONS_QUEUE) private readonly executionsQueue: Queue,
    @InjectQueue(INGESTION_QUEUE) private readonly ingestionQueue: Queue,
    @InjectQueue(MCP_HEALTH_QUEUE) private readonly mcpHealthQueue: Queue,
    @InjectQueue(SCHEDULES_QUEUE) private readonly schedulesQueue: Queue,
  ) {}

  /**
   * Liveness — "o processo esta de pe?", sem checar dependencia nenhuma.
   * Nunca deve falhar sozinho; usado pelo Railway pra saber se reinicia o
   * container (diferente de /health/ready, que reflete saude de dependencia).
   */
  @Public()
  @Get('live')
  live() {
    return {
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness — Postgres e Redis reais, com timeout curto pra nao pendurar o
   * healthcheck se uma dependencia estiver so lenta. O worker reporta seu
   * proprio heartbeat (worker-heartbeat.service.ts) via Redis; ele aparece
   * aqui so como informacao — nao derruba o status da API (a API continua
   * servindo GET/leitura mesmo sem worker, so quem depende de execucao
   * assincrona e afetado).
   */
  @Public()
  @Get('ready')
  async ready(@Res() res: Response) {
    const [postgres, redis] = await Promise.all([
      runCheck(async () => {
        await this.prisma.$queryRaw`SELECT 1`;
      }),
      runCheck(async () => {
        await this.cache.ping();
      }),
    ]);

    const heartbeatRaw = await this.cache.get(HEARTBEAT_KEY).catch(() => null);
    const worker = {
      ok: heartbeatRaw !== null,
      ...(heartbeatRaw
        ? (JSON.parse(heartbeatRaw) as Record<string, unknown>)
        : {}),
    };

    const ready = postgres.ok && redis.ok;
    const body = {
      status: ready ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: { postgres, redis, worker },
    };

    res
      .status(ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
      .json(body);
  }

  /**
   * @deprecated preferir /health/live (liveness) ou /health/ready
   * (readiness). Mantido com o shape original + campo `checks` aditivo —
   * consumidores existentes (Railway, docs/testing global-setup) continuam
   * funcionando sem mudanca.
   */
  @Public()
  @Get()
  async check() {
    const [postgres, redis] = await Promise.all([
      runCheck(async () => {
        await this.prisma.$queryRaw`SELECT 1`;
      }),
      runCheck(async () => {
        await this.cache.ping();
      }),
    ]);

    return {
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
      checks: { postgres, redis },
    };
  }

  /**
   * Metricas de fila (Fase 10) — profundidade e latencia aproximada por fila,
   * usadas para decidir auto-scaling horizontal dos workers no Railway.
   */
  @Public()
  @Get('queues')
  async queues() {
    const queues: Array<[string, Queue]> = [
      ['executions', this.executionsQueue],
      ['ingestion', this.ingestionQueue],
      ['mcp-health', this.mcpHealthQueue],
      ['schedules', this.schedulesQueue],
    ];

    const entries = await Promise.all(
      queues.map(async ([name, queue]) => {
        const [counts, oldestWaiting] = await Promise.all([
          queue.getJobCounts(
            'waiting',
            'active',
            'delayed',
            'failed',
            'completed',
          ),
          queue.getWaiting(0, 0),
        ]);
        const oldest = oldestWaiting[0];
        return [
          name,
          {
            ...counts,
            oldestWaitingMs: oldest
              ? Date.now() - (oldest.timestamp ?? Date.now())
              : 0,
          },
        ] as const;
      }),
    );

    return Object.fromEntries(entries);
  }
}
