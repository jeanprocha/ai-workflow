import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PENDING_EXECUTION_STATUSES } from '@workflow/shared';
import { EXECUTIONS_QUEUE } from '../queue/queue.module';
import { EngineService } from '../engine/engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionEventsService } from '../execution-events/execution-events.service';
import { ErrorWorkflowService } from './error-workflow.service';
import { ApprovalsService } from '../approvals/approvals.service';
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

interface RunJobData {
  executionId: string;
  replayFromNodeId?: string;
  replayInput?: unknown;
  /** H2-06: retomada pos-pausa — mesma Execution, node suspenso + dado da decisao. */
  resume?: { nodeId: string; data: unknown };
  _ctx?: JobContext;
}

@Processor(EXECUTIONS_QUEUE, {
  concurrency: Number(process.env.EXECUTIONS_CONCURRENCY ?? 5),
})
export class ExecutionsProcessor extends WorkerHost {
  private readonly logger = new Logger(ExecutionsProcessor.name);

  constructor(
    private readonly engine: EngineService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
    private readonly events: ExecutionEventsService,
    private readonly errorWorkflows: ErrorWorkflowService,
    private readonly approvals: ApprovalsService,
  ) {
    super();
  }

  async process(job: Job<RunJobData>): Promise<void> {
    await runJobInContext(EXECUTIONS_QUEUE, job, async () => {
      this.logger.log(
        `Executando job ${job.id} (execution ${job.data.executionId})`,
      );
      try {
        await this.engine.run(job.data.executionId, {
          replayFromNodeId: job.data.replayFromNodeId,
          replayInput: job.data.replayInput,
          resume: job.data.resume,
        });
      } catch (error) {
        await this.markStuckExecutionAsFailed(job.data.executionId, error);
        throw error; // preserva o comportamento existente: job vira "failed" no BullMQ, metricas de onJobFailed disparam normalmente.
      }
    });
  }

  /**
   * Rede de seguranca (H2-04): se engine.run() lancar ANTES de gravar o
   * status final (erro do Prisma em recordStep, versao apagada,
   * findUniqueOrThrow falhando etc.), a execucao ficava presa em `running`
   * pra sempre — o OrphanRecoveryService so roda no boot do worker, a partir
   * de 10 minutos. Isso virou visivel de verdade com o invoke sincrono da
   * API publicada (H2-04): o cliente esperaria, receberia 202, e o GET de
   * resultado devolveria `running` eternamente.
   *
   * O `where` com status PENDING_EXECUTION_STATUSES (derivado de
   * EXECUTION_PHASE, @workflow/shared) torna a operacao idempotente: nunca
   * sobrescreve um success/failed ja gravado (ex.: duplo-completed via job
   * stalled retomado por outro worker + esta rede de seguranca rodando em
   * paralelo, ou a engine ja ter gravado o failed antes de propagar o erro).
   * H2-06: exclui `waiting_approval` de proposito — o claim atomico do
   * engine.run() ja vira o status pra `running` antes de qualquer coisa
   * poder lancar, entao por definicao nunca ha uma execucao pausada presa
   * aqui; matar uma so por estar `waiting_approval` avisaria o usuario sem
   * motivo por uma aprovacao pendente legitima.
   */
  private async markStuckExecutionAsFailed(
    executionId: string,
    error: unknown,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(
      `engine.run() lancou antes de gravar o status final (execution ${executionId}): ${message}`,
    );
    try {
      const { count } = await this.prisma.execution.updateMany({
        where: {
          id: executionId,
          status: { in: [...PENDING_EXECUTION_STATUSES] },
        },
        data: { status: 'failed', error: message, finishedAt: new Date() },
      });
      if (count > 0) {
        this.events.emit({
          type: 'execution.completed',
          executionId,
          status: 'failed',
        });
        // H2-05: mesmo ponto de extensao do engine — so dispara se ESTA
        // chamada foi quem fechou a execucao (evita duplicar com o engine
        // caso ele tenha gravado failed um instante antes de propagar o erro).
        void this.errorWorkflows.dispatchForFailedExecution(executionId);
        // H2-06: cobre o caso raro de engine.run() ter criado a Approval
        // (RPC ja respondeu) mas crashado antes de virar o status pra
        // waiting_approval — sem isto, o link ficaria "valido" apontando
        // pra uma execucao que ja morreu por outro motivo.
        await this.approvals.voidOpenApprovals(executionId);
      }
    } catch (updateError) {
      // Se ate isso falhar (banco fora do ar), so loga — o orphan recovery
      // continua sendo o resgate final.
      this.logger.error(
        `Falha ao marcar execucao ${executionId} como failed apos crash da engine: ${String(updateError)}`,
      );
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<RunJobData>) {
    onJobCompleted(EXECUTIONS_QUEUE, job, this.metrics);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<RunJobData> | undefined, error: Error) {
    onJobFailed(EXECUTIONS_QUEUE, job, error, this.metrics);
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string) {
    onJobStalled(EXECUTIONS_QUEUE, jobId, this.metrics);
  }
}
