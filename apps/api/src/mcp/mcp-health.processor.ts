import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { MCP_HEALTH_QUEUE } from '../queue/queue.module';
import { McpService } from './mcp.service';
import { runJobInContext } from '../observability/request-context';

@Processor(MCP_HEALTH_QUEUE, {
  concurrency: Number(process.env.MCP_HEALTH_CONCURRENCY ?? 1),
})
export class McpHealthProcessor extends WorkerHost {
  private readonly logger = new Logger(McpHealthProcessor.name);

  constructor(private readonly mcp: McpService) {
    super();
  }

  async process(job: Job): Promise<void> {
    await runJobInContext(MCP_HEALTH_QUEUE, job, async () => {
      this.logger.log('Executando health check dos servidores MCP conectados');
      await this.mcp.healthCheckAll();
    });
  }
}
