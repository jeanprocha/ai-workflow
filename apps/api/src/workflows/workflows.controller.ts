import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { SaveGraphDto } from './dto/save-graph.dto';
import { RunWorkflowDto } from './dto/run-workflow.dto';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';
import { ExecutionsService } from '../executions/executions.service';

@Controller('workflows')
@UseGuards(WorkspaceGuard)
export class WorkflowsController {
  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly executionsService: ExecutionsService,
  ) {}

  @Get()
  list(@CurrentWorkspace() workspaceId: string) {
    return this.workflowsService.list(workspaceId);
  }

  @Post()
  create(
    @CurrentWorkspace() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkflowDto,
  ) {
    return this.workflowsService.create(workspaceId, user.userId, dto);
  }

  @Get(':id')
  findOne(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return this.workflowsService.findOne(workspaceId, id);
  }

  @Patch(':id')
  update(
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowDto,
  ) {
    return this.workflowsService.update(workspaceId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return this.workflowsService.remove(workspaceId, id);
  }

  @Put(':id/graph')
  saveGraph(
    @CurrentWorkspace() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SaveGraphDto,
  ) {
    return this.workflowsService.saveGraph(
      workspaceId,
      id,
      user.userId,
      dto.graph,
    );
  }

  @Post(':id/run')
  run(
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: RunWorkflowDto,
  ) {
    return this.executionsService.trigger(
      workspaceId,
      id,
      'manual',
      dto.input ?? {},
    );
  }
}
