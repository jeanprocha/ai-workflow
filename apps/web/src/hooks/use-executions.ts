import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export type ExecutionStatusValue = "queued" | "running" | "success" | "failed" | "canceled";

export interface ExecutionListItem {
  id: string;
  workflowId: string;
  versionId: string;
  status: ExecutionStatusValue;
  triggerType: string;
  inputPayload: unknown;
  outputPayload: unknown;
  durationMs: number | null;
  tokensTotal: number;
  costUsd: number;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  parentExecutionId: string | null;
  traceId: string | null;
  replayFromNodeId: string | null;
  workflow: { name: string };
}

export interface ExecutionStep {
  id: string;
  executionId: string;
  nodeId: string;
  nodeType: string;
  status: "success" | "failed";
  input: unknown;
  output: unknown;
  error: string | null;
  durationMs: number | null;
  tokens: number | null;
  model: string | null;
  costUsd: number | null;
  memoryMb: number | null;
  startedAt: string;
  finishedAt: string | null;
  attempt: number;
}

export interface ExecutionLogEntry {
  id: string;
  executionId: string;
  nodeId: string | null;
  level: string;
  event: string;
  payload: unknown;
  createdAt: string;
}

export interface ExecutionDetail extends ExecutionListItem {
  steps: ExecutionStep[];
  logs: ExecutionLogEntry[];
}

export interface ExecutionListResult {
  items: ExecutionListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ExecutionFilters {
  workflowId?: string;
  status?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

function buildQuery(filters: ExecutionFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useExecutions(filters: ExecutionFilters) {
  return useQuery({
    queryKey: ["executions", filters],
    queryFn: () => apiFetch<ExecutionListResult>(`/executions${buildQuery(filters)}`),
    placeholderData: (previous) => previous,
  });
}

/** Usado pelo indicador "ao vivo" da sidebar (Fase 6). */
export function useHasLiveExecution(): boolean {
  const running = useQuery({
    queryKey: ["executions", "live-check", "running"],
    queryFn: () => apiFetch<ExecutionListResult>("/executions?status=running&pageSize=1"),
    refetchInterval: 15000,
  });
  const queued = useQuery({
    queryKey: ["executions", "live-check", "queued"],
    queryFn: () => apiFetch<ExecutionListResult>("/executions?status=queued&pageSize=1"),
    refetchInterval: 15000,
  });
  return (running.data?.total ?? 0) > 0 || (queued.data?.total ?? 0) > 0;
}

export function useExecution(id: string | null) {
  return useQuery({
    queryKey: ["executions", "detail", id],
    queryFn: () => apiFetch<ExecutionDetail>(`/executions/${id}`),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "queued" || status === "running" ? 2000 : false;
    },
  });
}

export function useRetryExecution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<ExecutionListItem>(`/executions/${id}/retry`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["executions"] }),
  });
}

export interface ReplayInput {
  id: string;
  input?: unknown;
  fromNodeId?: string;
}

export function useReplayExecution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input, fromNodeId }: ReplayInput) =>
      apiFetch<ExecutionListItem>(`/executions/${id}/replay`, {
        method: "POST",
        body: { input, fromNodeId },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["executions"] }),
  });
}
