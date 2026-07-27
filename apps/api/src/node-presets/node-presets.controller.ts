import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NodePresetsService } from './node-presets.service';
import { CreateNodePresetDto } from './dto/create-node-preset.dto';
import { UpdateNodePresetDto } from './dto/update-node-preset.dto';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';

@Controller('node-presets')
@UseGuards(WorkspaceGuard)
export class NodePresetsController {
  constructor(private readonly nodePresetsService: NodePresetsService) {}

  @Get()
  list(
    @CurrentWorkspace() workspaceId: string,
    @Query('nodeType') nodeType?: string,
  ) {
    return this.nodePresetsService.list(workspaceId, nodeType);
  }

  @Post()
  create(
    @CurrentWorkspace() workspaceId: string,
    @Body() dto: CreateNodePresetDto,
  ) {
    return this.nodePresetsService.create(workspaceId, dto);
  }

  @Patch(':id')
  update(
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateNodePresetDto,
  ) {
    return this.nodePresetsService.update(workspaceId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return this.nodePresetsService.remove(workspaceId, id);
  }
}
