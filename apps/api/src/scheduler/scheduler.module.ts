import { Module } from '@nestjs/common';
import { SchedulerController } from './scheduler.controller';
import { SchedulerService } from './scheduler.service';
import { QueueModule } from '../queue/queue.module';
import { ExecutionsModule } from '../executions/executions.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';

/**
 * So produtor (agenda/remove jobs repetiveis). O consumo roda no worker
 * (Fase 10) — ver ScheduleProcessor em apps/api/src/worker/worker.module.ts.
 */
@Module({
  imports: [QueueModule, ExecutionsModule, WorkspacesModule],
  controllers: [SchedulerController],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
