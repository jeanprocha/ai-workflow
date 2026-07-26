import { Module } from '@nestjs/common';
import { ExecutionsController } from './executions.controller';
import { ExecutionsService } from './executions.service';
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
  providers: [ExecutionsService, ExecutionOwnershipGuard],
  exports: [ExecutionsService],
})
export class ExecutionsModule {}
