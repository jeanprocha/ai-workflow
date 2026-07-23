import { Module } from '@nestjs/common';
import { ExecutionsController } from './executions.controller';
import { ExecutionsService } from './executions.service';
import { ExecutionsProcessor } from './executions.processor';
import { QueueModule } from '../queue/queue.module';
import { EngineModule } from '../engine/engine.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [QueueModule, EngineModule, WorkspacesModule],
  controllers: [ExecutionsController],
  providers: [ExecutionsService, ExecutionsProcessor],
  exports: [ExecutionsService],
})
export class ExecutionsModule {}
