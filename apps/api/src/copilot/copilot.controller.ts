import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { CopilotService } from './copilot.service';
import { CopilotChatDto } from './dto/copilot-chat.dto';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';
import { Lang } from '../i18n/lang.decorator';
import type { Locale } from '../i18n/pt-to-en';

@Controller('workflows/:id/copilot')
@UseGuards(WorkspaceGuard)
export class CopilotController {
  constructor(private readonly copilot: CopilotService) {}

  @Post('chat')
  chat(
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: CopilotChatDto,
    @Lang() lang: Locale,
  ) {
    return this.copilot.chat(workspaceId, id, dto, lang);
  }

  @Post('suggestions/:suggestionId/apply')
  apply(
    @CurrentWorkspace() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('suggestionId') suggestionId: string,
  ) {
    return this.copilot.applySuggestion(workspaceId, user.userId, suggestionId);
  }
}
