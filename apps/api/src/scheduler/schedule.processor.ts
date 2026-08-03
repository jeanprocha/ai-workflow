import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { WorkflowGraph } from '@workflow/shared';
import { SCHEDULES_QUEUE } from '../queue/queue.module';
import { ExecutionsService } from '../executions/executions.service';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulerService } from './scheduler.service';
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
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerService,
  ) {
    super();
  }

  async process(job: Job<ScheduleJobData>): Promise<void> {
    await runJobInContext(SCHEDULES_QUEUE, job, async () => {
      const { workflowId, workspaceId } = job.data;

      // Rede de seguranca do gate que mora em SchedulerService.
      // syncWorkflowSchedule ja garante que so fluxo `active` chega a ser
      // agendado, mas o agendamento vive no Redis e o status no Postgres: os
      // dois podem divergir (job criado por uma versao antiga do codigo,
      // restore de backup, UPDATE direto no banco). Quando divergem, o job
      // orfao se auto-remove aqui em vez de disparar — e por isso que fluxos
      // ja agendados como rascunho param sozinhos no primeiro tick, sem
      // script de migracao. So removemos com a resposta do banco em maos: se
      // a consulta falhar, a excecao sobe e o job e retentado. Depois de
      // remover, `resyncIfReactivated` relê o status para nao apagar um
      // agendamento que um PATCH concorrente acabou de criar.
      const workflow = await this.prisma.workflow.findFirst({
        where: { id: workflowId, workspaceId },
        select: { status: true },
      });
      if (!workflow || workflow.status !== 'active') {
        this.logger.warn(
          `Agendamento orfao do workflow ${workflowId} (${workflow?.status ?? 'inexistente'}): removendo em vez de disparar`,
        );
        await this.scheduler.removeSchedule(workflowId);
        await this.resyncIfReactivated(workflowId, workspaceId);
        return;
      }

      this.logger.log(`Disparando execucao agendada do workflow ${workflowId}`);
      await this.executions.trigger(workspaceId, workflowId, 'cron', {});
    });
  }

  /**
   * Releitura obrigatoria DEPOIS do removeSchedule acima. Entre ler o status e
   * remover o job existe uma janela: se um `PATCH status: 'active'` cair no
   * meio dela, ele roda seu proprio remove + recria o repeatable job, e a nossa
   * remocao (decidida com um status ja velho) apaga o job recem-nascido. O
   * resultado seria um fluxo `active`, com cron habilitado e NENHUM job — a
   * divergencia silenciosa, porque nada reconstroi o agendamento ate o proximo
   * save/rollback/PATCH.
   *
   * Reler o status depois de remover fecha a janela: quem chegou primeiro nao
   * importa, no fim sempre ha alguem olhando o estado final do Postgres. Como
   * `syncWorkflowSchedule` remove antes de agendar, re-sincronizar aqui e
   * idempotente mesmo se o PATCH ja tiver recriado o job.
   *
   * E nivel `error`, nao `warn`: chegar aqui significa que o processador quase
   * destruiu um agendamento valido.
   */
  private async resyncIfReactivated(
    workflowId: string,
    workspaceId: string,
  ): Promise<void> {
    const current = await this.prisma.workflow.findFirst({
      where: { id: workflowId, workspaceId },
      select: {
        status: true,
        currentVersion: { select: { graph: true } },
      },
    });
    if (current?.status !== 'active') return;

    const graph = current.currentVersion?.graph as unknown as
      WorkflowGraph | undefined;
    if (!graph) {
      this.logger.error(
        `Workflow ${workflowId} foi ativado durante a remocao do agendamento, mas nao tem versao salva: nada a re-sincronizar`,
      );
      return;
    }

    this.logger.error(
      `Workflow ${workflowId} foi ativado durante a remocao do agendamento: re-sincronizando o repeatable job`,
    );
    await this.scheduler.syncWorkflowSchedule(
      workflowId,
      workspaceId,
      graph,
      current.status,
    );
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
