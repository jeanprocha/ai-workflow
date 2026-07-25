import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { SCHEDULES_QUEUE } from '../queue/queue.module';
import { ExecutionsService } from '../executions/executions.service';
import {
  runJobInContext,
  type JobContext,
} from '../observability/request-context';
import {
  onJobCompleted,
  onJobFailed,
  onJobStalled,
} from '../observability/queue-events';
import { MetricsService } from '../observability/metrics.service';

interface ScheduleJobData {
  workflowId: string;
  workspaceId: string;
  _ctx?: JobContext;
}

@Processor(SCHEDULES_QUEUE, {
  concurrency: Number(process.env.SCHEDULES_CONCURRENCY ?? 5),
})
export class ScheduleProcessor extends WorkerHost {
  private readonly logger = new Logger(ScheduleProcessor.name);

  constructor(
    private readonly executions: ExecutionsService,
    private readonly metrics: MetricsService,
  ) {
    super();
  }

  async process(job: Job<ScheduleJobData>): Promise<void> {
    await runJobInContext(SCHEDULES_QUEUE, job, async () => {
      this.logger.log(
        `Disparando execucao agendada do workflow ${job.data.workflowId}`,
      );
      await this.executions.trigger(
        job.data.workspaceId,
        job.data.workflowId,
        'cron',
        {},
      );
    });
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<ScheduleJobData>) {
    onJobCompleted(SCHEDULES_QUEUE, job, this.metrics);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ScheduleJobData> | undefined, error: Error) {
    onJobFailed(SCHEDULES_QUEUE, job, error, this.metrics);
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string) {
    onJobStalled(SCHEDULES_QUEUE, jobId, this.metrics);
  }
}
