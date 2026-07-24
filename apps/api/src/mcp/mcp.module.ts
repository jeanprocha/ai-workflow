import { Module, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { McpHealthProcessor } from './mcp-health.processor';
import { QueueModule, MCP_HEALTH_QUEUE } from '../queue/queue.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';

const HEALTH_CHECK_INTERVAL_MS = 60_000;

@Module({
  imports: [QueueModule, WorkspacesModule],
  controllers: [McpController],
  providers: [McpService, McpHealthProcessor],
  exports: [McpService],
})
export class McpModule implements OnModuleInit {
  constructor(@InjectQueue(MCP_HEALTH_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      'health-check',
      {},
      { repeat: { every: HEALTH_CHECK_INTERVAL_MS } },
    );
  }
}
