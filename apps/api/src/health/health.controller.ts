import { Controller, Get } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Public } from '../auth/decorators/public.decorator';
import {
  EXECUTIONS_QUEUE,
  INGESTION_QUEUE,
  MCP_HEALTH_QUEUE,
  SCHEDULES_QUEUE,
} from '../queue/queue.module';

@Controller('health')
export class HealthController {
  constructor(
    @InjectQueue(EXECUTIONS_QUEUE) private readonly executionsQueue: Queue,
    @InjectQueue(INGESTION_QUEUE) private readonly ingestionQueue: Queue,
    @InjectQueue(MCP_HEALTH_QUEUE) private readonly mcpHealthQueue: Queue,
    @InjectQueue(SCHEDULES_QUEUE) private readonly schedulesQueue: Queue,
  ) {}

  @Public()
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
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
