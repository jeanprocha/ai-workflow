import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ExecutionsService } from './executions.service';
import { ExecutionEventsService } from '../execution-events/execution-events.service';
import { ListExecutionsQueryDto } from './dto/list-executions-query.dto';
import { ReplayExecutionDto } from './dto/replay-execution.dto';
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
  list(
    @CurrentWorkspace() workspaceId: string,
    @Query() query: ListExecutionsQueryDto,
  ) {
    return this.executionsService.list(workspaceId, query);
  }

  @Get(':id')
  findOne(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return this.executionsService.findOne(workspaceId, id);
  }

  @Post(':id/retry')
  retry(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return this.executionsService.retry(workspaceId, id);
  }

  @Post(':id/replay')
  replay(
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: ReplayExecutionDto,
  ) {
    return this.executionsService.replay(workspaceId, id, dto);
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
