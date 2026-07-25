import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { INGESTION_QUEUE } from '../queue/queue.module';
import { KnowledgeService } from './knowledge.service';
import {
  runJobInContext,
  type JobContext,
} from '../observability/request-context';

interface IngestJobData {
  documentId: string;
  _ctx?: JobContext;
}

@Processor(INGESTION_QUEUE, {
  concurrency: Number(process.env.INGESTION_CONCURRENCY ?? 2),
})
export class IngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestionProcessor.name);

  constructor(private readonly knowledge: KnowledgeService) {
    super();
  }

  async process(job: Job<IngestJobData>): Promise<void> {
    await runJobInContext(INGESTION_QUEUE, job, async () => {
      this.logger.log(
        `Processando documento ${job.data.documentId} (job ${job.id})`,
      );
      await this.knowledge.ingest(job.data.documentId);
    });
  }
}
