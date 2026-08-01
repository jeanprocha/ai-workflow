import { Module } from '@nestjs/common';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { FlowApiController } from './flow-api.controller';
import { FlowApiKeyGuard } from './guards/flow-api-key.guard';
import { ExecutionWaiter } from './execution-waiter';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ExecutionsModule } from '../executions/executions.module';

@Module({
  imports: [WorkspacesModule, ExecutionsModule],
  controllers: [ApiKeysController, FlowApiController],
  providers: [ApiKeysService, FlowApiKeyGuard, ExecutionWaiter],
})
export class FlowApiModule {}
