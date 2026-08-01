import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';

/** Gestao de chaves de API por fluxo (autenticado, molde workflows/:id/copilot). */
@Controller('workflows/:id/api-keys')
@UseGuards(WorkspaceGuard)
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  list(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return this.apiKeys.list(workspaceId, id);
  }

  @Post()
  create(
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.apiKeys.create(workspaceId, id, dto);
  }

  @Delete(':keyId')
  revoke(
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
    @Param('keyId') keyId: string,
  ) {
    return this.apiKeys.revoke(workspaceId, id, keyId);
  }
}
