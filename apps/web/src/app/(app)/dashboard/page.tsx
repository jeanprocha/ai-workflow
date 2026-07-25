"use client";

import Link from "next/link";
import { MetricCard, StatusBadge, EmptyState, type ExecutionStatus } from "@workflow/ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAnalyticsSummary, useRecentExecutions } from "@/hooks/use-analytics";
import { useDictionary, useLocale } from "@/lib/i18n";
import { formatDateTime, formatDuration, formatNumber, formatUsd } from "@/lib/format";

function toBadgeStatus(status: string): ExecutionStatus {
  return status === "canceled" ? "failed" : (status as ExecutionStatus);
}

export default function DashboardPage() {
  const t = useDictionary();
  const locale = useLocale();
  const { data: summary, isLoading: loadingSummary } = useAnalyticsSummary();
  const { data: recent, isLoading: loadingRecent } = useRecentExecutions();

  const metrics = summary
    ? [
        { label: t.dashboard.metrics.workflows, value: String(summary.workflowsCount) },
        {
          label: t.dashboard.metrics.executions,
          value: formatNumber(summary.executionsCount, locale),
        },
        {
          label: t.dashboard.metrics.aiRequests,
          value: formatNumber(summary.aiRequestsCount, locale),
        },
        {
          label: t.dashboard.metrics.avgDuration,
          value: `${(summary.avgDurationMs / 1000).toFixed(1)}s`,
        },
        { label: t.dashboard.metrics.failures, value: String(summary.failuresCount) },
        { label: t.dashboard.metrics.aiCost, value: formatUsd(summary.costUsdTotal, locale) },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{t.dashboard.title}</h1>
        <p className="text-sm text-muted-foreground">{t.dashboard.description}</p>
      </div>

      {loadingSummary ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {metrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-md font-medium text-foreground">
            {t.dashboard.recentExecutions.title}
          </h2>
          <Button size="sm" variant="ghost" render={<Link href="/executions" />}>
            {t.dashboard.recentExecutions.viewAll}
          </Button>
        </div>

        {loadingRecent && <Skeleton className="m-4 h-32 rounded-lg" />}

        {!loadingRecent && !recent?.length && (
          <div className="p-4">
            <EmptyState
              title={t.dashboard.recentExecutions.empty.title}
              description={t.dashboard.recentExecutions.empty.description}
            />
          </div>
        )}

        {!!recent?.length && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.dashboard.recentExecutions.columns.workflow}</TableHead>
                <TableHead>{t.dashboard.recentExecutions.columns.status}</TableHead>
                <TableHead className="text-right">
                  {t.dashboard.recentExecutions.columns.duration}
                </TableHead>
                <TableHead className="text-right">
                  {t.dashboard.recentExecutions.columns.startedAt}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((execution) => (
                <TableRow key={execution.id}>
                  <TableCell className="font-medium text-foreground">
                    <Link href={`/executions/${execution.id}`} className="hover:underline">
                      {execution.workflow.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={toBadgeStatus(execution.status)} labels={t.common.executionStatus} />
                  </TableCell>
                  <TableCell className="tabular text-right font-mono text-sm">
                    {execution.durationMs === null ? "—" : formatDuration(execution.durationMs, locale)}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {formatDateTime(execution.startedAt, locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
