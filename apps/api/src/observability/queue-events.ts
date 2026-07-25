import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

const logger = new Logger('QueueEvents');

/**
 * @nestjs/bullmq exige que os metodos @OnWorkerEvent vivam dentro da propria
 * classe @Processor (nao da pra registrar um listener externo) — este
 * arquivo so centraliza o CORPO do log pra nao repetir 3 handlers x 4
 * processors. Cada processor chama uma destas funcoes no seu proprio
 * @OnWorkerEvent. O hook de metrica (Fase 4) entra aqui tambem, no mesmo
 * lugar, sem precisar mexer nos processors de novo.
 */

export function onJobCompleted(queue: string, job: Job): void {
  const durationMs =
    job.finishedOn && job.processedOn
      ? job.finishedOn - job.processedOn
      : undefined;
  logger.log(
    { queue, jobId: job.id, attemptsMade: job.attemptsMade, durationMs },
    'queue.job.completed',
  );
}

export function onJobFailed(
  queue: string,
  job: Job | undefined,
  error: Error,
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
}

export function onJobStalled(queue: string, jobId: string): void {
  logger.warn({ queue, jobId }, 'queue.job.stalled');
}
