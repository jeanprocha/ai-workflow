import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AiSuggestionType } from '@prisma/client';
import { AiSuggestionsService } from './ai-suggestions.service';
import { ResolveSuggestionDto } from './dto/resolve-suggestion.dto';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';

@Controller('ai-suggestions')
@UseGuards(WorkspaceGuard)
export class AiSuggestionsController {
  constructor(private readonly suggestions: AiSuggestionsService) {}

  @Get()
  list(
    @CurrentWorkspace() workspaceId: string,
    @Query('workflowId') workflowId?: string,
    @Query('type') type?: AiSuggestionType,
  ) {
    return this.suggestions.list(workspaceId, { workflowId, type });
  }

  @Post(':id/resolve')
  resolve(
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: ResolveSuggestionDto,
  ) {
    return this.suggestions.resolve(workspaceId, id, dto.status);
  }
}
