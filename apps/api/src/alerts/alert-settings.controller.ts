import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';
import { AlertSettingsService } from './alert-settings.service';
import { AlertsService } from './alerts.service';
import { UpdateAlertSettingsDto } from './dto/update-alert-settings.dto';
import { TestAlertDto } from './dto/test-alert.dto';

@Controller('workspaces/alert-settings')
@UseGuards(WorkspaceGuard)
export class AlertSettingsController {
  constructor(
    private readonly settings: AlertSettingsService,
    private readonly alerts: AlertsService,
  ) {}

  @Get()
  get(@CurrentWorkspace() workspaceId: string) {
    return this.settings.get(workspaceId);
  }

  @Put()
  update(
    @CurrentWorkspace() workspaceId: string,
    @Body() dto: UpdateAlertSettingsDto,
  ) {
    return this.settings.update(workspaceId, dto);
  }

  @Post('test')
  async test(
    @CurrentWorkspace() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TestAlertDto,
  ) {
    await this.alerts.sendTest({
      workspaceId,
      toEmail: user.email,
      webhookUrl: dto.webhookUrl,
    });
  }
}
