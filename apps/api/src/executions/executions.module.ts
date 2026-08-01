import { Module } from '@nestjs/common';
import { ExecutionsController } from './executions.controller';
import { ExecutionsService } from './executions.service';
import { ErrorWorkflowService } from './error-workflow.service';
import { ExecutionOwnershipGuard } from './guards/execution-ownership.guard';
import { QueueModule } from '../queue/queue.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';

/**
 * So produtor (enfileira jobs). O consumo roda no worker (Fase 10) —
 * ver ExecutionsProcessor, registrado em apps/api/src/worker/worker.module.ts.
 */
@Module({
  imports: [QueueModule, WorkspacesModule],
  controllers: [ExecutionsController],
  providers: [ExecutionsService, ErrorWorkflowService, ExecutionOwnershipGuard],
  exports: [ExecutionsService, ErrorWorkflowService],
})
export class ExecutionsModule {}
