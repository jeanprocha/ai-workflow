import { Module } from '@nestjs/common';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ExecutionsModule } from '../executions/executions.module';

@Module({
  imports: [WorkspacesModule, ExecutionsModule],
  controllers: [WorkflowsController],
  providers: [WorkflowsService],
})
export class WorkflowsModule {}
