import { Module } from '@nestjs/common';
import { SchedulerController } from './scheduler.controller';
import { SchedulerService } from './scheduler.service';
import { ScheduleProcessor } from './schedule.processor';
import { QueueModule } from '../queue/queue.module';
import { ExecutionsModule } from '../executions/executions.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [QueueModule, ExecutionsModule, WorkspacesModule],
  controllers: [SchedulerController],
  providers: [SchedulerService, ScheduleProcessor],
  exports: [SchedulerService],
})
export class SchedulerModule {}
