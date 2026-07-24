import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { MCP_HEALTH_QUEUE } from '../queue/queue.module';
import { McpService } from './mcp.service';

@Processor(MCP_HEALTH_QUEUE, {
  concurrency: Number(process.env.MCP_HEALTH_CONCURRENCY ?? 1),
})
export class McpHealthProcessor extends WorkerHost {
  private readonly logger = new Logger(McpHealthProcessor.name);

  constructor(private readonly mcp: McpService) {
    super();
  }

  async process(): Promise<void> {
    this.logger.log('Executando health check dos servidores MCP conectados');
    await this.mcp.healthCheckAll();
  }
}
