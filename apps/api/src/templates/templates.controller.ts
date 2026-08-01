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
import { TemplatesService } from './templates.service';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

/**
 * Catalogo de templates e global + por workspace (workspace_id NULL = seed
 * global — ver ADR-006). Qualquer membro do workspace pode gerir os
 * templates do proprio workspace; globais sao read-only (sem rota de
 * edicao/remocao para eles — ver findOwned() no service).
 */
@Controller('templates')
@UseGuards(WorkspaceGuard)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  list(@CurrentWorkspace() workspaceId: string) {
    return this.templatesService.list(workspaceId);
  }

  @Post(':id/use')
  use(
    @CurrentWorkspace() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.templatesService.use(workspaceId, user.userId, id);
  }

  @Post()
  create(
    @CurrentWorkspace() workspaceId: string,
    @Body() dto: CreateTemplateDto,
  ) {
    return this.templatesService.create(workspaceId, dto);
  }

  @Patch(':id')
  update(
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.templatesService.update(workspaceId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return this.templatesService.remove(workspaceId, id);
  }
}
