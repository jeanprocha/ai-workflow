import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { ExecutionListItem } from "./use-executions";

export interface AnalyticsSummary {
  workflowsCount: number;
  executionsCount: number;
  aiRequestsCount: number;
  avgDurationMs: number;
  failuresCount: number;
  failureRate: number;
  costUsdTotal: number;
  tokensTotal: number;
}

export interface TimeseriesPoint {
  date: string;
  executions: number;
  failures: number;
  tokens: number;
  costUsd: number;
}

export interface ProviderCost {
  provider: string;
  costUsd: number;
  tokens: number;
}

export function useAnalyticsSummary() {
  return useQuery({
    queryKey: ["analytics", "summary"],
    queryFn: () => apiFetch<AnalyticsSummary>("/analytics/summary"),
  });
}

export function useRecentExecutions() {
  return useQuery({
    queryKey: ["analytics", "recent-executions"],
    queryFn: () => apiFetch<ExecutionListItem[]>("/analytics/recent-executions"),
  });
}

export function useTimeseries(days = 14) {
  return useQuery({
    queryKey: ["analytics", "timeseries", days],
    queryFn: () => apiFetch<TimeseriesPoint[]>(`/analytics/timeseries?days=${days}`),
  });
}

export function useCostByProvider() {
  return useQuery({
    queryKey: ["analytics", "cost-by-provider"],
    queryFn: () => apiFetch<ProviderCost[]>("/analytics/cost-by-provider"),
  });
}
