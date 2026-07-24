import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
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

  /** Chamado a cada save/rollback de grafo — (re)agenda ou remove o repeatable job do workflow. */
  async syncWorkflowSchedule(
    workflowId: string,
    workspaceId: string,
    graph: WorkflowGraph,
  ): Promise<void> {
    await this.removeSchedule(workflowId);

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
