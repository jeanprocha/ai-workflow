import { Controller, Get, Res } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { MetricsService } from './metrics.service';
import {
  EXECUTIONS_QUEUE,
  INGESTION_QUEUE,
  MCP_HEALTH_QUEUE,
  SCHEDULES_QUEUE,
} from '../queue/queue.module';

@Controller()
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    @InjectQueue(EXECUTIONS_QUEUE) private readonly executionsQueue: Queue,
    @InjectQueue(INGESTION_QUEUE) private readonly ingestionQueue: Queue,
    @InjectQueue(MCP_HEALTH_QUEUE) private readonly mcpHealthQueue: Queue,
    @InjectQueue(SCHEDULES_QUEUE) private readonly schedulesQueue: Queue,
  ) {}

  @Public()
  @Get('metrics')
  async getMetrics(@Res() res: Response) {
    await this.refreshQueueDepth();
    res.setHeader('Content-Type', this.metrics.registry.contentType);
    res.send(await this.metrics.registry.metrics());
  }

  /** queue_depth e um snapshot — atualizado aqui, no momento do scrape, nao continuamente. */
  private async refreshQueueDepth(): Promise<void> {
    const queues: Array<[string, Queue]> = [
      ['executions', this.executionsQueue],
      ['ingestion', this.ingestionQueue],
      ['mcp-health', this.mcpHealthQueue],
      ['schedules', this.schedulesQueue],
    ];

    await Promise.all(
      queues.map(async ([name, queue]) => {
        const counts = await queue.getJobCounts(
          'waiting',
          'active',
          'delayed',
          'failed',
          'completed',
        );
        for (const [state, count] of Object.entries(counts)) {
          this.metrics.queueDepth.set({ queue: name, state }, count);
        }
      }),
    );
  }
}
