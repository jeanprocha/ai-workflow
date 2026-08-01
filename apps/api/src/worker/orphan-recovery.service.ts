import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionEventsService } from '../execution-events/execution-events.service';
import { ErrorWorkflowService } from '../executions/error-workflow.service';
import { ApprovalsService } from '../approvals/approvals.service';

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
    private readonly approvals: ApprovalsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const cutoff = new Date(Date.now() - ORPHAN_THRESHOLD_MS);
    // H2-06: runStartedAt (nao startedAt, que e imutavel) — uma execucao
    // retomada apos dias em waiting_approval teria startedAt antigo e seria
    // falsamente elegivel aqui no proximo boot do worker. runStartedAt e
    // regravado em TODO claim atomico (inicial e retomada, engine.service.ts).
    const orphans = await this.prisma.execution.findMany({
      where: { status: 'running', runStartedAt: { lt: cutoff } },
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
      // H2-06: fecha qualquer Approval aberta desta execucao orfa — o `where
      // status:'running'` acima ja exclui waiting_approval de proposito
      // (pausada legitima), mas cobre o caso em que a Approval foi criada
      // (RPC ja respondeu) e o worker morreu antes de virar o status.
      await this.approvals.voidOpenApprovals(orphan.id);
    }
  }
}
