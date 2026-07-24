import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AgentsService } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { ChatAgentDto } from './dto/chat-agent.dto';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';

@Controller('agents')
@UseGuards(WorkspaceGuard)
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  list(@CurrentWorkspace() workspaceId: string) {
    return this.agentsService.list(workspaceId);
  }

  @Post()
  create(@CurrentWorkspace() workspaceId: string, @Body() dto: CreateAgentDto) {
    return this.agentsService.create(workspaceId, dto);
  }

  @Get(':id')
  findOne(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return this.agentsService.findOne(workspaceId, id);
  }

  @Patch(':id')
  update(
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAgentDto,
  ) {
    return this.agentsService.update(workspaceId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return this.agentsService.remove(workspaceId, id);
  }

  @Post(':id/chat')
  async chat(
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: ChatAgentDto,
  ) {
    return this.agentsService.chat(workspaceId, id, dto.message, dto.history);
  }
}
