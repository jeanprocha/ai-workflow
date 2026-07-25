"use client";

import { MetricCard } from "@workflow/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, BarList } from "@/components/charts/simple-charts";
import {
  useAnalyticsSummary,
  useCostByProvider,
  useTimeseries,
} from "@/hooks/use-analytics";
import { useDictionary, useLocale } from "@/lib/i18n";
import { formatNumber, formatPercent, formatShortDate, formatUsd } from "@/lib/format";

export default function AnalyticsPage() {
  const t = useDictionary();
  const locale = useLocale();
  const { data: summary, isLoading: loadingSummary } = useAnalyticsSummary();
  const { data: timeseries, isLoading: loadingTimeseries } = useTimeseries(14);
  const { data: costByProvider, isLoading: loadingCost } = useCostByProvider();

  const providerLabels: Record<string, string> = t.analytics.providerLabels;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{t.analytics.title}</h1>
        <p className="text-sm text-muted-foreground">{t.analytics.description}</p>
      </div>

      {loadingSummary ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : (
        summary && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricCard label={t.analytics.metrics.executions} value={String(summary.executionsCount)} />
            <MetricCard
              label={t.analytics.metrics.failureRate}
              value={formatPercent(summary.failureRate * 100, locale)}
            />
            <MetricCard
              label={t.analytics.metrics.tokensTotal}
              value={formatNumber(summary.tokensTotal, locale)}
            />
            <MetricCard
              label={t.analytics.metrics.costTotal}
              value={formatUsd(summary.costUsdTotal, locale)}
            />
          </div>
        )
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-medium text-foreground">{t.analytics.charts.executionsByDay}</h2>
          {loadingTimeseries ? (
            <Skeleton className="h-40 rounded-lg" />
          ) : (
            <LineChart
              emptyLabel={t.analytics.charts.noDataInPeriod}
              data={(timeseries ?? []).map((point) => ({
                label: formatShortDate(point.date, locale),
                value: point.executions,
              }))}
            />
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-medium text-foreground">{t.analytics.charts.failuresByDay}</h2>
          {loadingTimeseries ? (
            <Skeleton className="h-40 rounded-lg" />
          ) : (
            <LineChart
              color="var(--danger)"
              emptyLabel={t.analytics.charts.noDataInPeriod}
              data={(timeseries ?? []).map((point) => ({
                label: formatShortDate(point.date, locale),
                value: point.failures,
              }))}
            />
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-medium text-foreground">{t.analytics.charts.costByProvider}</h2>
        {loadingCost ? (
          <Skeleton className="h-24 rounded-lg" />
        ) : (
          <BarList
            emptyLabel={t.analytics.charts.noData}
            data={(costByProvider ?? [])
              .slice()
              .sort((a, b) => b.costUsd - a.costUsd)
              .map((row) => ({
                label: providerLabels[row.provider] ?? row.provider,
                value: Number(row.costUsd.toFixed(4)),
              }))}
          />
        )}
      </div>
    </div>
  );
}
