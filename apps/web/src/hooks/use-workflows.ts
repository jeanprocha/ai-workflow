import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Workflow, WorkflowGraph, WorkflowVersion } from "@workflow/shared";
import { apiFetch } from "@/lib/api-client";

const WORKFLOWS_KEY = ["workflows"];

export interface WorkflowWithVersion extends Workflow {
  currentVersion: WorkflowVersion | null;
}

export interface ExecutionSummary {
  id: string;
  status: "queued" | "running" | "success" | "failed" | "canceled";
}

export function useWorkflows() {
  return useQuery({
    queryKey: WORKFLOWS_KEY,
    queryFn: () => apiFetch<Workflow[]>("/workflows"),
  });
}

export function useWorkflow(id: string) {
  return useQuery({
    queryKey: [...WORKFLOWS_KEY, id],
    queryFn: () => apiFetch<WorkflowWithVersion>(`/workflows/${id}`),
    enabled: !!id,
  });
}

export function useSaveGraph(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (graph: WorkflowGraph) =>
      apiFetch<WorkflowWithVersion>(`/workflows/${id}/graph`, {
        method: "PUT",
        body: { graph },
      }),
    onSuccess: (data) => {
      queryClient.setQueryData([...WORKFLOWS_KEY, id], data);
    },
  });
}

export function useRunWorkflow(id: string) {
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      apiFetch<ExecutionSummary>(`/workflows/${id}/run`, {
        method: "POST",
        body: { input },
      }),
  });
}

export function useCreateWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; description?: string }) =>
      apiFetch<Workflow>("/workflows", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKFLOWS_KEY }),
  });
}

export function useUpdateWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; name?: string; status?: string }) =>
      apiFetch<Workflow>(`/workflows/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKFLOWS_KEY }),
  });
}

export function useDeleteWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/workflows/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKFLOWS_KEY }),
  });
}
