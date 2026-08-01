import { Module } from '@nestjs/common';
import { MailerModule } from '../mailer/mailer.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { AlertsService } from './alerts.service';
import { AlertSettingsService } from './alert-settings.service';
import { AlertSettingsController } from './alert-settings.controller';

@Module({
  imports: [MailerModule, WorkspacesModule],
  controllers: [AlertSettingsController],
  providers: [AlertsService, AlertSettingsService],
  exports: [AlertsService],
})
export class AlertsModule {}
