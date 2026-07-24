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

function toBadgeStatus(status: string): ExecutionStatus {
  return status === "canceled" ? "failed" : (status as ExecutionStatus);
}

function formatDuration(ms: number | null) {
  if (ms === null) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export default function DashboardPage() {
  const { data: summary, isLoading: loadingSummary } = useAnalyticsSummary();
  const { data: recent, isLoading: loadingRecent } = useRecentExecutions();

  const metrics = summary
    ? [
        { label: "Fluxos", value: String(summary.workflowsCount) },
        { label: "Execucoes", value: summary.executionsCount.toLocaleString("pt-BR") },
        { label: "IA Requests", value: summary.aiRequestsCount.toLocaleString("pt-BR") },
        { label: "Tempo medio", value: `${(summary.avgDurationMs / 1000).toFixed(1)}s` },
        { label: "Falhas", value: String(summary.failuresCount) },
        { label: "Custo IA", value: `US$ ${summary.costUsdTotal.toFixed(2)}` },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visao geral da plataforma.</p>
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
          <h2 className="text-md font-medium text-foreground">Execucoes recentes</h2>
          <Button size="sm" variant="ghost" render={<Link href="/executions" />}>
            Ver todas
          </Button>
        </div>

        {loadingRecent && <Skeleton className="m-4 h-32 rounded-lg" />}

        {!loadingRecent && !recent?.length && (
          <div className="p-4">
            <EmptyState
              title="Nenhuma execucao ainda"
              description="Execute um fluxo para ver o historico aqui."
            />
          </div>
        )}

        {!!recent?.length && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fluxo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Duracao</TableHead>
                <TableHead className="text-right">Iniciado</TableHead>
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
                    <StatusBadge status={toBadgeStatus(execution.status)} />
                  </TableCell>
                  <TableCell className="tabular text-right font-mono text-sm">
                    {formatDuration(execution.durationMs)}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {new Date(execution.startedAt).toLocaleString("pt-BR")}
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
