import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { EXECUTIONS_QUEUE } from '../queue/queue.module';
import { EngineService } from '../engine/engine.service';
import {
  runJobInContext,
  type JobContext,
} from '../observability/request-context';
import {
  onJobCompleted,
  onJobFailed,
  onJobStalled,
} from '../observability/queue-events';

interface RunJobData {
  executionId: string;
  replayFromNodeId?: string;
  replayInput?: unknown;
  _ctx?: JobContext;
}

@Processor(EXECUTIONS_QUEUE, {
  concurrency: Number(process.env.EXECUTIONS_CONCURRENCY ?? 5),
})
export class ExecutionsProcessor extends WorkerHost {
  private readonly logger = new Logger(ExecutionsProcessor.name);

  constructor(private readonly engine: EngineService) {
    super();
  }

  async process(job: Job<RunJobData>): Promise<void> {
    await runJobInContext(EXECUTIONS_QUEUE, job, async () => {
      this.logger.log(
        `Executando job ${job.id} (execution ${job.data.executionId})`,
      );
      await this.engine.run(job.data.executionId, {
        replayFromNodeId: job.data.replayFromNodeId,
        replayInput: job.data.replayInput,
      });
    });
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<RunJobData>) {
    onJobCompleted(EXECUTIONS_QUEUE, job);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<RunJobData> | undefined, error: Error) {
    onJobFailed(EXECUTIONS_QUEUE, job, error);
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string) {
    onJobStalled(EXECUTIONS_QUEUE, jobId);
  }
}
