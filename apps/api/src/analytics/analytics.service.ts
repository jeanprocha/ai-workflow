import { Injectable } from '@nestjs/common';
import { getModelInfo } from '@workflow/ai';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';

interface TimeseriesRow {
  day: Date;
  executions: bigint;
  failures: bigint;
  tokens: bigint;
  cost: number;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  summary(workspaceId: string) {
    return this.cache.getOrSet(
      `analytics:summary:${workspaceId}`,
      30,
      async () => {
        const where = { workflow: { workspaceId } };
        const [workflowsCount, agg, failuresCount, aiStepsAgg, suggestionsAgg] =
          await Promise.all([
            this.prisma.workflow.count({ where: { workspaceId } }),
            this.prisma.execution.aggregate({
              where,
              _avg: { durationMs: true },
              _sum: { costUsd: true, tokensTotal: true },
              _count: true,
            }),
            this.prisma.execution.count({
              where: { ...where, status: 'failed' },
            }),
            this.prisma.executionStep.count({
              where: {
                execution: { workflow: { workspaceId } },
                tokens: { not: null },
              },
            }),
            // Custo/tokens das 4 features de IA (Autocomplete/Copilot/Debugger)
            // — chamadas fora da engine, nao entram no aggregate de Execution
            // acima. Sem isso o custo de IA no dashboard ficava subestimado.
            this.prisma.aiSuggestion.aggregate({
              where: { workspaceId },
              _sum: { costUsd: true, inputTokens: true, outputTokens: true },
            }),
          ]);

        const executionsCount = agg._count;
        return {
          workflowsCount,
          executionsCount,
          aiRequestsCount: aiStepsAgg,
          avgDurationMs: Math.round(agg._avg.durationMs ?? 0),
          failuresCount,
          failureRate:
            executionsCount > 0 ? failuresCount / executionsCount : 0,
          costUsdTotal:
            (agg._sum.costUsd ?? 0) + (suggestionsAgg._sum.costUsd ?? 0),
          tokensTotal:
            (agg._sum.tokensTotal ?? 0) +
            (suggestionsAgg._sum.inputTokens ?? 0) +
            (suggestionsAgg._sum.outputTokens ?? 0),
        };
      },
    );
  }

  recentExecutions(workspaceId: string, limit = 5) {
    return this.cache.getOrSet(
      `analytics:recent:${workspaceId}:${limit}`,
      10,
      () =>
        this.prisma.execution.findMany({
          where: { workflow: { workspaceId } },
          orderBy: { startedAt: 'desc' },
          take: limit,
          include: { workflow: { select: { name: true } } },
        }),
    );
  }

  timeseries(workspaceId: string, days: number) {
    return this.cache.getOrSet(
      `analytics:timeseries:${workspaceId}:${days}`,
      60,
      async () => {
        const rows = await this.prisma.$queryRaw<TimeseriesRow[]>`
          SELECT
            date_trunc('day', e.started_at) AS day,
            COUNT(*)::bigint AS executions,
            COUNT(*) FILTER (WHERE e.status = 'failed')::bigint AS failures,
            COALESCE(SUM(e.tokens_total), 0)::bigint AS tokens,
            COALESCE(SUM(e.cost_usd), 0)::float AS cost
          FROM executions e
          JOIN workflows w ON w.id = e.workflow_id
          WHERE w.workspace_id = ${workspaceId}
            AND e.started_at >= NOW() - (${days}::text || ' days')::interval
          GROUP BY 1
          ORDER BY 1 ASC
        `;
        return rows.map((row) => ({
          date: row.day.toISOString().slice(0, 10),
          executions: Number(row.executions),
          failures: Number(row.failures),
          tokens: Number(row.tokens),
          costUsd: row.cost,
        }));
      },
    );
  }

  costByProvider(workspaceId: string) {
    return this.cache.getOrSet(
      `analytics:cost-by-provider:${workspaceId}`,
      60,
      async () => {
        const grouped = await this.prisma.executionStep.groupBy({
          by: ['model'],
          where: {
            execution: { workflow: { workspaceId } },
            model: { not: null },
          },
          _sum: { costUsd: true, tokens: true },
        });

        const byProvider = new Map<
          string,
          { costUsd: number; tokens: number }
        >();
        for (const row of grouped) {
          const info = row.model ? getModelInfo(row.model) : undefined;
          const provider = info?.provider ?? 'desconhecido';
          const current = byProvider.get(provider) ?? { costUsd: 0, tokens: 0 };
          current.costUsd += row._sum.costUsd ?? 0;
          current.tokens += row._sum.tokens ?? 0;
          byProvider.set(provider, current);
        }

        return [...byProvider.entries()].map(([provider, value]) => ({
          provider,
          ...value,
        }));
      },
    );
  }
}
