import { Module } from '@nestjs/common';
import { CostOptimizerController } from './cost-optimizer.controller';
import { CostOptimizerService } from './cost-optimizer.service';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { AiSuggestionsModule } from '../ai-suggestions/ai-suggestions.module';

@Module({
  imports: [WorkspacesModule, WorkflowsModule, AiSuggestionsModule],
  controllers: [CostOptimizerController],
  providers: [CostOptimizerService],
})
export class CostOptimizerModule {}
