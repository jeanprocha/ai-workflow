import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { KnowledgeService } from './knowledge.service';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto';
import { SearchKnowledgeDto } from './dto/search-knowledge.dto';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

@Controller('knowledge')
@UseGuards(WorkspaceGuard)
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get()
  list(@CurrentWorkspace() workspaceId: string) {
    return this.knowledgeService.listKnowledgeBases(workspaceId);
  }

  @Post()
  create(
    @CurrentWorkspace() workspaceId: string,
    @Body() dto: CreateKnowledgeBaseDto,
  ) {
    return this.knowledgeService.createKnowledgeBase(workspaceId, dto);
  }

  @Delete(':id')
  remove(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return this.knowledgeService.removeKnowledgeBase(workspaceId, id);
  }

  @Get(':id/documents')
  listDocuments(
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.knowledgeService.listDocuments(workspaceId, id);
  }

  @Post(':id/documents')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  uploadDocument(
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.knowledgeService.uploadDocument(workspaceId, id, file);
  }

  @Delete(':id/documents/:documentId')
  removeDocument(
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    return this.knowledgeService.removeDocument(workspaceId, id, documentId);
  }

  @Post(':id/search')
  search(
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: SearchKnowledgeDto,
  ) {
    return this.knowledgeService.search(workspaceId, id, dto);
  }
}
