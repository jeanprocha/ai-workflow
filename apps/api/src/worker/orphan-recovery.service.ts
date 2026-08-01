import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionEventsService } from '../execution-events/execution-events.service';
import { ErrorWorkflowService } from '../executions/error-workflow.service';

const ORPHAN_THRESHOLD_MS = Number(
  process.env.ORPHAN_EXECUTION_THRESHOLD_MS ?? 10 * 60_000,
);

/**
 * Ao subir, todo worker varre execucoes travadas em "running" ha mais tempo
 * do que qualquer execucao legitima levaria — sinal de que o worker anterior
 * morreu no meio da execucao (crash, deploy, OOM) e a linha nunca chegou a um
 * status final. Marca como failed em vez de deixar preso para sempre; o
 * usuario decide se quer tentar de novo (retry ja existente), evitando
 * reexecutar efeitos colaterais (ex.: um email ja enviado) silenciosamente.
 *
 * Complementa a recuperacao de job "stalled" que o proprio BullMQ ja faz
 * nativamente (um Worker morto libera o job para outro Worker retomar) —
 * este servico cobre o caso em que a linha de Execution ficou inconsistente
 * mesmo que o job em si nao seja mais retomado (ex.: maxStalledCount esgotado).
 */
@Injectable()
export class OrphanRecoveryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OrphanRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ExecutionEventsService,
    private readonly errorWorkflows: ErrorWorkflowService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const cutoff = new Date(Date.now() - ORPHAN_THRESHOLD_MS);
    const orphans = await this.prisma.execution.findMany({
      where: { status: 'running', startedAt: { lt: cutoff } },
      select: { id: true },
    });

    if (orphans.length === 0) return;

    this.logger.warn(
      `${orphans.length} execucao(oes) orfa(s) encontrada(s) (status "running" ha mais de ${ORPHAN_THRESHOLD_MS}ms) — marcando como failed.`,
    );

    for (const orphan of orphans) {
      await this.prisma.execution.update({
        where: { id: orphan.id },
        data: {
          status: 'failed',
          error:
            'Execucao interrompida: o worker foi encerrado antes de concluir (crash, deploy ou timeout). Use "Tentar novamente" se necessario.',
          finishedAt: new Date(),
        },
      });
      this.events.emit({
        type: 'execution.completed',
        executionId: orphan.id,
        status: 'failed',
      });
      // H2-05: worker morto tambem e uma falha real do fluxo — sem isso, uma
      // execucao orfa nunca disparava o tratador (nem o alerting, de resto).
      void this.errorWorkflows.dispatchForFailedExecution(orphan.id);
    }
  }
}
