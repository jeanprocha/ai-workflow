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
import { CredentialsService } from './credentials.service';
import { CreateCredentialDto } from './dto/create-credential.dto';
import { UpdateCredentialDto } from './dto/update-credential.dto';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';

@Controller('credentials')
@UseGuards(WorkspaceGuard)
export class CredentialsController {
  constructor(private readonly credentialsService: CredentialsService) {}

  @Get()
  list(@CurrentWorkspace() workspaceId: string) {
    return this.credentialsService.list(workspaceId);
  }

  @Post()
  create(
    @CurrentWorkspace() workspaceId: string,
    @Body() dto: CreateCredentialDto,
  ) {
    return this.credentialsService.create(workspaceId, dto);
  }

  @Patch(':id')
  update(
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCredentialDto,
  ) {
    return this.credentialsService.update(workspaceId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return this.credentialsService.remove(workspaceId, id);
  }
}
