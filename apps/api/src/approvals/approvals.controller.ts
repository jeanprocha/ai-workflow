import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
import { DecideApprovalDto } from './dto/decide-approval.dto';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@Controller('approvals')
@UseGuards(WorkspaceGuard)
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  list(@CurrentWorkspace() workspaceId: string) {
    return this.approvals.list(workspaceId);
  }

  // Acao (decide algo que ja existe), nao criacao de recurso — 200, nao o
  // 201 default do Nest pra POST (mesmo precedente de FlowApiController.invoke).
  @HttpCode(HttpStatus.OK)
  @Post(':id/approve')
  approve(
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: DecideApprovalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.approvals.decideById(
      workspaceId,
      id,
      'approved',
      dto.comment,
      user.email,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/reject')
  reject(
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: DecideApprovalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.approvals.decideById(
      workspaceId,
      id,
      'rejected',
      dto.comment,
      user.email,
    );
  }
}
