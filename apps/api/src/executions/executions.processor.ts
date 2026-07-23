import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { EXECUTIONS_QUEUE } from '../queue/queue.module';
import { EngineService } from '../engine/engine.service';

interface RunJobData {
  executionId: string;
}

@Processor(EXECUTIONS_QUEUE)
export class ExecutionsProcessor extends WorkerHost {
  private readonly logger = new Logger(ExecutionsProcessor.name);

  constructor(private readonly engine: EngineService) {
    super();
  }

  async process(job: Job<RunJobData>): Promise<void> {
    this.logger.log(
      `Executando job ${job.id} (execution ${job.data.executionId})`,
    );
    await this.engine.run(job.data.executionId);
  }
}
