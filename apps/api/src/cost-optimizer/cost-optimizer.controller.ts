import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CostOptimizerService } from './cost-optimizer.service';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';

@Controller('cost-optimizer')
@UseGuards(WorkspaceGuard)
export class CostOptimizerController {
  constructor(private readonly costOptimizer: CostOptimizerService) {}

  @Get('analyze')
  analyze(
    @CurrentWorkspace() workspaceId: string,
    @Query('workflowId') workflowId?: string,
  ) {
    return this.costOptimizer.analyze(workspaceId, workflowId);
  }

  @Post(':suggestionId/apply')
  apply(
    @CurrentWorkspace() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('suggestionId') suggestionId: string,
  ) {
    return this.costOptimizer.applySuggestion(
      workspaceId,
      user.userId,
      suggestionId,
    );
  }
}
