import { Module } from '@nestjs/common';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ExecutionsModule } from '../executions/executions.module';
import { SchedulerModule } from '../scheduler/scheduler.module';

@Module({
  imports: [WorkspacesModule, ExecutionsModule, SchedulerModule],
  controllers: [WorkflowsController],
  providers: [WorkflowsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
