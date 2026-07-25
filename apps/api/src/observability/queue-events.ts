import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { MetricsService } from './metrics.service';

const logger = new Logger('QueueEvents');

/**
 * @nestjs/bullmq exige que os metodos @OnWorkerEvent vivam dentro da propria
 * classe @Processor (nao da pra registrar um listener externo) — este
 * arquivo so centraliza o CORPO do log+metrica pra nao repetir 3 handlers x
 * 4 processors. Cada processor injeta MetricsService no proprio construtor
 * e chama uma destas funcoes no seu @OnWorkerEvent, passando `this.metrics`.
 */

export function onJobCompleted(
  queue: string,
  job: Job,
  metrics: MetricsService,
): void {
  const durationMs =
    job.finishedOn && job.processedOn
      ? job.finishedOn - job.processedOn
      : undefined;
  logger.log(
    { queue, jobId: job.id, attemptsMade: job.attemptsMade, durationMs },
    'queue.job.completed',
  );

  metrics.queueJobsTotal.inc({ queue, event: 'completed' });
  // job.timestamp = quando o job ficou pronto pra processar (pra repeatable
  // jobs, e essencialmente o horario previsto do disparo) — a diferenca pra
  // processedOn cobre tanto congestionamento de fila quanto drift de cron.
  if (job.processedOn) {
    metrics.queueJobWaitSeconds.observe(
      { queue },
      Math.max(0, job.processedOn - job.timestamp) / 1000,
    );
  }
}

export function onJobFailed(
  queue: string,
  job: Job | undefined,
  error: Error,
  metrics: MetricsService,
): void {
  logger.error(
    {
      queue,
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      err: error,
    },
    'queue.job.failed',
  );

  metrics.queueJobsTotal.inc({ queue, event: 'failed' });
}

export function onJobStalled(
  queue: string,
  jobId: string,
  metrics: MetricsService,
): void {
  logger.warn({ queue, jobId }, 'queue.job.stalled');

  metrics.queueJobsTotal.inc({ queue, event: 'stalled' });
}
