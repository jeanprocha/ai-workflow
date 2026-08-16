import { Module, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { ApprovalsController } from './approvals.controller';
import { ApprovePublicController } from './approve-public.controller';
import { ApprovalsService } from './approvals.service';
import { QueueModule, APPROVALS_QUEUE } from '../queue/queue.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ExecutionsModule } from '../executions/executions.module';

const SWEEP_INTERVAL_MS = Number(
  process.env.APPROVAL_SWEEP_INTERVAL_MS ?? 60_000,
);

/**
 * So produtor (registra o job repetivel do sweeper). O consumo roda no
 * worker — ver ApprovalsSweepProcessor em apps/api/src/worker/worker.module.ts
 * (molde McpModule/McpHealthProcessor). Exporta ApprovalsService pro
 * EngineService (worker, via EngineModule) usar no handler do RPC
 * ctx.requestApproval e no void de aprovacoes abertas nos caminhos
 * terminais.
 */
@Module({
  imports: [QueueModule, WorkspacesModule, ExecutionsModule],
  controllers: [ApprovalsController, ApprovePublicController],
  providers: [ApprovalsService],
  exports: [ApprovalsService],
})
export class ApprovalsModule implements OnModuleInit {
  constructor(@InjectQueue(APPROVALS_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.add('sweep', {}, { repeat: { every: SWEEP_INTERVAL_MS } });
  }
}
