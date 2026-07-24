import { Module, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { QueueModule, MCP_HEALTH_QUEUE } from '../queue/queue.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';

const HEALTH_CHECK_INTERVAL_MS = 60_000;

/**
 * So produtor (registra o job repetivel de health-check). O consumo roda no
 * worker (Fase 10) — ver McpHealthProcessor em apps/api/src/worker/worker.module.ts.
 * O registro do job repetivel e idempotente no BullMQ (mesma chave deriva do
 * nome+opcoes de repeat), entao e seguro chamar `queue.add` tanto daqui quanto
 * do bootstrap do worker sem duplicar o agendamento.
 */
@Module({
  imports: [QueueModule, WorkspacesModule],
  controllers: [McpController],
  providers: [McpService],
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
