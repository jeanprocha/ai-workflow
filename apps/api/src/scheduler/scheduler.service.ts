import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { WorkflowStatus } from '@prisma/client';
import { CronExpressionParser } from 'cron-parser';
import type { WorkflowGraph } from '@workflow/shared';
import { SCHEDULES_QUEUE } from '../queue/queue.module';

export interface CronConfig {
  cronExpression?: string;
  timezone?: string;
  enabled?: boolean;
}

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(@InjectQueue(SCHEDULES_QUEUE) private readonly queue: Queue) {}

  /**
   * Chamado a cada save/rollback de grafo e a cada PATCH de status — (re)agenda
   * ou remove o repeatable job do workflow. Como sempre remove ANTES de decidir,
   * e idempotente e serve tambem como "desagendar": apagar o node cron,
   * desabilita-lo ou tirar o fluxo de `active` cai todo no mesmo caminho.
   *
   * O gate de status mora aqui, e nao no ScheduleProcessor, de proposito: o
   * agendamento e o unico estado que vive fora do Postgres (repeatable job no
   * Redis) e nao tem tela que o liste. Gatear na criacao mantem o invariante
   * "existe job repetivel <=> fluxo `active` com trigger.cron habilitado", que
   * torna o estado do Redis derivavel do Postgres; gatear so no consumo
   * deixaria jobs de rascunho tiquetaqueando pra sempre e batendo no banco a
   * cada tick, sem nada visivel explicando por que nao disparam.
   */
  async syncWorkflowSchedule(
    workflowId: string,
    workspaceId: string,
    graph: WorkflowGraph,
    status: WorkflowStatus,
  ): Promise<void> {
    await this.removeSchedule(workflowId);

    // "Rascunho nao roda sozinho": um fluxo em draft so dispara por acao
    // explicita de quem esta editando (Executar no editor, que ignora status).
    // Ativar e o que liga o cron — e o PATCH de status ja chama este metodo.
    if (status !== 'active') return;

    const cronNode = graph.nodes.find((node) => node.type === 'trigger.cron');
    if (!cronNode) return;

    const config = cronNode.config as CronConfig;
    if (!config.enabled || !config.cronExpression) return;

    const timezone = config.timezone || 'UTC';
    try {
      CronExpressionParser.parse(config.cronExpression, { tz: timezone });
    } catch (error) {
      this.logger.warn(
        `Expressao cron invalida para o workflow ${workflowId}: ${config.cronExpression} (${String(error)})`,
      );
      return;
    }

    await this.queue.add(
      'run',
      { workflowId, workspaceId },
      {
        // RepeatOptions.jobId esta deprecated — usamos "key" customizada
        // (recomendado pela lib) para localizar/remover o job depois.
        repeat: {
          pattern: config.cronExpression,
          tz: timezone,
          key: workflowId,
        },
      },
    );
  }

  async removeSchedule(workflowId: string): Promise<void> {
    const existing = await this.queue.getRepeatableJobs();
    for (const job of existing) {
      if (job.key.includes(workflowId)) {
        await this.queue.removeRepeatableByKey(job.key);
      }
    }
  }

  previewNextRuns(
    cronExpression: string,
    timezone: string,
    count = 5,
  ): string[] {
    const interval = CronExpressionParser.parse(cronExpression, {
      tz: timezone || 'UTC',
    });
    const runs: string[] = [];
    for (let i = 0; i < count; i++) {
      runs.push(interval.next().toDate().toISOString());
    }
    return runs;
  }
}
