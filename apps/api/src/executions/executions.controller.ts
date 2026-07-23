import { Controller, Get, Param, Sse, UseGuards } from '@nestjs/common';
import { ExecutionsService } from './executions.service';
import { ExecutionEventsService } from '../execution-events/execution-events.service';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';

@Controller('executions')
@UseGuards(WorkspaceGuard)
export class ExecutionsController {
  constructor(
    private readonly executionsService: ExecutionsService,
    private readonly events: ExecutionEventsService,
  ) {}

  @Get()
  list(@CurrentWorkspace() workspaceId: string) {
    return this.executionsService.list(workspaceId);
  }

  @Get(':id')
  findOne(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return this.executionsService.findOne(workspaceId, id);
  }

  @Sse(':id/stream')
  async stream(
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
  ) {
    // Garante que a execucao pertence ao workspace antes de abrir o stream (evita IDOR).
    await this.executionsService.findOne(workspaceId, id);
    return this.events.toObservable(id);
  }
}
