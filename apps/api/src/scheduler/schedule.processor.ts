import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { SCHEDULES_QUEUE } from '../queue/queue.module';
import { ExecutionsService } from '../executions/executions.service';

interface ScheduleJobData {
  workflowId: string;
  workspaceId: string;
}

@Processor(SCHEDULES_QUEUE)
export class ScheduleProcessor extends WorkerHost {
  private readonly logger = new Logger(ScheduleProcessor.name);

  constructor(private readonly executions: ExecutionsService) {
    super();
  }

  async process(job: Job<ScheduleJobData>): Promise<void> {
    this.logger.log(
      `Disparando execucao agendada do workflow ${job.data.workflowId}`,
    );
    await this.executions.trigger(
      job.data.workspaceId,
      job.data.workflowId,
      'cron',
      {},
    );
  }
}
