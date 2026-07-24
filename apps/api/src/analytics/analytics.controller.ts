import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';

@Controller('analytics')
@UseGuards(WorkspaceGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  summary(@CurrentWorkspace() workspaceId: string) {
    return this.analyticsService.summary(workspaceId);
  }

  @Get('recent-executions')
  recentExecutions(@CurrentWorkspace() workspaceId: string) {
    return this.analyticsService.recentExecutions(workspaceId);
  }

  @Get('timeseries')
  timeseries(
    @CurrentWorkspace() workspaceId: string,
    @Query('days') days?: string,
  ) {
    const parsed = days ? Number.parseInt(days, 10) : 14;
    return this.analyticsService.timeseries(
      workspaceId,
      Number.isFinite(parsed) && parsed > 0 ? parsed : 14,
    );
  }

  @Get('cost-by-provider')
  costByProvider(@CurrentWorkspace() workspaceId: string) {
    return this.analyticsService.costByProvider(workspaceId);
  }
}
