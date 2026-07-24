import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkflowGraph } from "@workflow/shared";
import { apiFetch } from "@/lib/api-client";

export interface WorkflowVersionSummary {
  id: string;
  versionNumber: number;
  createdAt: string;
  createdByName: string;
  isCurrent: boolean;
}

export interface WorkflowVersionDetail extends WorkflowVersionSummary {
  graph: WorkflowGraph;
}

export function useWorkflowVersions(workflowId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["workflows", workflowId, "versions"],
    queryFn: () => apiFetch<WorkflowVersionSummary[]>(`/workflows/${workflowId}/versions`),
    enabled,
  });
}

export function useWorkflowVersion(workflowId: string, versionId: string | null) {
  return useQuery({
    queryKey: ["workflows", workflowId, "versions", versionId],
    queryFn: () =>
      apiFetch<WorkflowVersionDetail>(`/workflows/${workflowId}/versions/${versionId}`),
    enabled: !!versionId,
  });
}

export function useRollbackWorkflow(workflowId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) =>
      apiFetch(`/workflows/${workflowId}/versions/${versionId}/rollback`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows", workflowId] });
      queryClient.invalidateQueries({ queryKey: ["workflows", workflowId, "versions"] });
    },
  });
}
