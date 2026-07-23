import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { VariablesService } from './variables.service';
import { CreateVariableDto } from './dto/create-variable.dto';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';

@Controller('variables')
@UseGuards(WorkspaceGuard)
export class VariablesController {
  constructor(private readonly variablesService: VariablesService) {}

  @Get()
  list(@CurrentWorkspace() workspaceId: string) {
    return this.variablesService.list(workspaceId);
  }

  @Post()
  create(
    @CurrentWorkspace() workspaceId: string,
    @Body() dto: CreateVariableDto,
  ) {
    return this.variablesService.create(workspaceId, dto);
  }

  @Delete(':id')
  remove(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return this.variablesService.remove(workspaceId, id);
  }
}
