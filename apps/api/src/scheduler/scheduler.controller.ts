import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { PreviewCronDto } from './dto/preview-cron.dto';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard';

@Controller('scheduler')
@UseGuards(WorkspaceGuard)
export class SchedulerController {
  constructor(private readonly schedulerService: SchedulerService) {}

  @Post('preview')
  preview(@Body() dto: PreviewCronDto) {
    try {
      return {
        nextRuns: this.schedulerService.previewNextRuns(
          dto.cronExpression,
          dto.timezone ?? 'UTC',
        ),
      };
    } catch (error) {
      throw new BadRequestException(
        `Expressao cron invalida: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
