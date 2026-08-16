import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { APPROVALS_QUEUE } from '../queue/queue.module';
import { ApprovalsService } from './approvals.service';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionEventsService } from '../execution-events/execution-events.service';
import { runJobInContext } from '../observability/request-context';
import {
  onJobCompleted,
  onJobFailed,
  onJobStalled,
} from '../observability/queue-events';
import { MetricsService } from '../observability/metrics.service';

/** Depois disto, para de tentar reenfileirar e falha a execucao explicitamente (ver failExecutionAfterExhaustedResume). */
const MAX_RESUME_ATTEMPTS = 5;

/**
 * H2-06: sweeper repeatable (nao delayed job — ver plano/ADR-011), duas
 * varreduras por tick. Timeout e retomada travada sao dois problemas
 * diferentes que so tem em comum "precisam de alguem rodando periodicamente
 * fora do fluxo normal de decisao", daí viverem no mesmo processor.
 */
@Processor(APPROVALS_QUEUE, { concurrency: 1 })
export class ApprovalsSweepProcessor extends WorkerHost {
  private readonly logger = new Logger(ApprovalsSweepProcessor.name);

  constructor(
    private readonly approvals: ApprovalsService,
    private readonly prisma: PrismaService,
    private readonly events: ExecutionEventsService,
    private readonly metrics: MetricsService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    await runJobInContext(APPROVALS_QUEUE, job, async () => {
      await this.sweepExpired();
      await this.sweepStuckResumes();
    });
  }

  /** 1a varredura: aplica onTimeout em quem venceu o prazo sem decisao. */
  private async sweepExpired(): Promise<void> {
    const expired = await this.approvals.findExpiredUndecided();
    if (expired.length === 0) return;
    this.logger.log(
      `${expired.length} aprovacao(oes) vencida(s) sem decisao — aplicando onTimeout.`,
    );
    for (const approval of expired) {
      const applied = await this.approvals.applyTimeout(
        approval.id,
        approval.onTimeout,
      );
      if (!applied) {
        // Corrida: uma decisao humana chegou entre o findMany e o applyTimeout
        // — ela venceu, nao e erro.
        this.logger.debug(
          `Aprovacao ${approval.id} foi decidida bem na hora do sweep — timeout descartado.`,
        );
      }
    }
  }

  /**
   * 2a varredura: decididas mas cujo enqueueResume nunca chegou a rodar
   * (worker morreu entre o updateMany da decisao e o queue.add). Sem isto, a
   * fila nao define `attempts` — o default do BullMQ (1) vale, e um job que
   * nunca chegou a existir nunca e retentado por conta propria.
   */
  private async sweepStuckResumes(): Promise<void> {
    const stuck =
      await this.approvals.findDecidedNotEnqueued(MAX_RESUME_ATTEMPTS);
    for (const approval of stuck) {
      this.logger.warn(
        `Reenfileirando retomada da aprovacao ${approval.id} (decidida, nunca chegou a enfileirar).`,
      );
      await this.approvals.enqueueResume(approval.id, {
        approved: approval.decision === 'approved',
        comment: approval.comment,
        decidedBy: approval.decidedBy,
        decidedAt: (approval.decidedAt as Date).toISOString(),
      });
    }

    const exhausted =
      await this.approvals.findExhaustedResumes(MAX_RESUME_ATTEMPTS);
    for (const approval of exhausted) {
      await this.failExecutionAfterExhaustedResume(
        approval.executionId,
        approval.id,
      );
    }
  }

  /**
   * Depois de MAX_RESUME_ATTEMPTS tentativas sem sucesso, para de tentar e
   * falha a execucao explicitamente — melhor que deixar presa em
   * waiting_approval pra sempre com uma decisao humana ja tomada que nunca
   * chega a valer. Idempotente: o `where status: 'waiting_approval'` faz
   * ticks seguintes virarem no-op (count===0) depois da primeira vez.
   */
  private async failExecutionAfterExhaustedResume(
    executionId: string,
    approvalId: string,
  ): Promise<void> {
    const message = `Nao foi possivel retomar a execucao apos a decisao da aprovacao ${approvalId} (excedeu ${MAX_RESUME_ATTEMPTS} tentativas de reenfileiramento).`;
    const { count } = await this.prisma.execution.updateMany({
      where: { id: executionId, status: 'waiting_approval' },
      data: { status: 'failed', error: message, finishedAt: new Date() },
    });
    if (count > 0) {
      this.logger.error(message);
      this.events.emit({
        type: 'execution.completed',
        executionId,
        status: 'failed',
      });
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    onJobCompleted(APPROVALS_QUEUE, job, this.metrics);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error) {
    onJobFailed(APPROVALS_QUEUE, job, error, this.metrics);
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string) {
    onJobStalled(APPROVALS_QUEUE, jobId, this.metrics);
  }
}
