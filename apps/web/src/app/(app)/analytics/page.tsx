"use client";

import { MetricCard } from "@workflow/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, BarList } from "@/components/charts/simple-charts";
import {
  useAnalyticsSummary,
  useCostByProvider,
  useTimeseries,
} from "@/hooks/use-analytics";

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Claude",
  gemini: "Gemini",
  ollama: "Ollama",
  desconhecido: "Desconhecido",
};

function formatShortDate(iso: string) {
  const date = new Date(iso);
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function AnalyticsPage() {
  const { data: summary, isLoading: loadingSummary } = useAnalyticsSummary();
  const { data: timeseries, isLoading: loadingTimeseries } = useTimeseries(14);
  const { data: costByProvider, isLoading: loadingCost } = useCostByProvider();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Metricas agregadas de execucao e uso de IA nos ultimos 14 dias.
        </p>
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
            <MetricCard label="Execucoes" value={String(summary.executionsCount)} />
            <MetricCard
              label="Taxa de falha"
              value={`${(summary.failureRate * 100).toFixed(1)}%`}
            />
            <MetricCard label="Tokens totais" value={summary.tokensTotal.toLocaleString("pt-BR")} />
            <MetricCard label="Custo IA total" value={`US$ ${summary.costUsdTotal.toFixed(2)}`} />
          </div>
        )
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-medium text-foreground">Execucoes por dia</h2>
          {loadingTimeseries ? (
            <Skeleton className="h-40 rounded-lg" />
          ) : (
            <LineChart
              data={(timeseries ?? []).map((point) => ({
                label: formatShortDate(point.date),
                value: point.executions,
              }))}
            />
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-medium text-foreground">Falhas por dia</h2>
          {loadingTimeseries ? (
            <Skeleton className="h-40 rounded-lg" />
          ) : (
            <LineChart
              color="var(--danger)"
              data={(timeseries ?? []).map((point) => ({
                label: formatShortDate(point.date),
                value: point.failures,
              }))}
            />
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-medium text-foreground">Custo de IA por provider</h2>
        {loadingCost ? (
          <Skeleton className="h-24 rounded-lg" />
        ) : (
          <BarList
            data={(costByProvider ?? [])
              .slice()
              .sort((a, b) => b.costUsd - a.costUsd)
              .map((row) => ({
                label: PROVIDER_LABELS[row.provider] ?? row.provider,
                value: Number(row.costUsd.toFixed(4)),
              }))}
          />
        )}
      </div>
    </div>
  );
}
