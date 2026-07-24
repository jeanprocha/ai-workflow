import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { DebuggerService } from './debugger.service';
import { DiagnoseExecutionDto } from './dto/diagnose-execution.dto';
import { ApplySuggestionDto } from './dto/apply-suggestion.dto';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';

@Controller('executions')
@UseGuards(WorkspaceGuard)
export class DebuggerController {
  constructor(private readonly debuggerService: DebuggerService) {}

  @Post(':id/diagnose')
  diagnose(
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: DiagnoseExecutionDto,
  ) {
    return this.debuggerService.diagnose(workspaceId, id, dto);
  }

  @Post('diagnose/:suggestionId/apply')
  apply(
    @CurrentWorkspace() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('suggestionId') suggestionId: string,
    @Body() dto: ApplySuggestionDto,
  ) {
    return this.debuggerService.applySuggestion(
      workspaceId,
      user.userId,
      suggestionId,
      dto.suggestionIndex,
    );
  }
}
