import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAlertSettingsDto } from './dto/update-alert-settings.dto';

export interface AlertSettingsView {
  emailEnabled: boolean;
  webhookUrl: string | null;
}

const DEFAULTS: AlertSettingsView = { emailEnabled: true, webhookUrl: null };

@Injectable()
export class AlertSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(workspaceId: string): Promise<AlertSettingsView> {
    const settings = await this.prisma.workspaceAlertSetting.findUnique({
      where: { workspaceId },
    });
    if (!settings) return DEFAULTS;
    return {
      emailEnabled: settings.emailEnabled,
      webhookUrl: settings.webhookUrl,
    };
  }

  async update(
    workspaceId: string,
    dto: UpdateAlertSettingsDto,
  ): Promise<AlertSettingsView> {
    const current = await this.get(workspaceId);
    const updated = await this.prisma.workspaceAlertSetting.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        emailEnabled: dto.emailEnabled ?? current.emailEnabled,
        webhookUrl:
          dto.webhookUrl === undefined ? current.webhookUrl : dto.webhookUrl,
      },
      update: {
        ...(dto.emailEnabled !== undefined
          ? { emailEnabled: dto.emailEnabled }
          : {}),
        ...(dto.webhookUrl !== undefined ? { webhookUrl: dto.webhookUrl } : {}),
      },
    });
    return {
      emailEnabled: updated.emailEnabled,
      webhookUrl: updated.webhookUrl,
    };
  }
}
