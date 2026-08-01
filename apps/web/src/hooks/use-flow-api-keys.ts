import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface FlowApiKeySummary {
  id: string;
  name: string;
  lastFour: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/** So existe na resposta do create — nunca faz parte do cache da lista. */
export interface FlowApiKeyCreated extends FlowApiKeySummary {
  key: string;
}

function keysQueryKey(workflowId: string) {
  return ["workflows", workflowId, "api-keys"];
}

export function useFlowApiKeys(workflowId: string, enabled: boolean) {
  return useQuery({
    queryKey: keysQueryKey(workflowId),
    queryFn: () => apiFetch<FlowApiKeySummary[]>(`/workflows/${workflowId}/api-keys`),
    enabled,
  });
}

export function useCreateFlowApiKey(workflowId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<FlowApiKeyCreated>(`/workflows/${workflowId}/api-keys`, {
        method: "POST",
        body: { name },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keysQueryKey(workflowId) }),
  });
}

export function useRevokeFlowApiKey(workflowId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (keyId: string) =>
      apiFetch<void>(`/workflows/${workflowId}/api-keys/${keyId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keysQueryKey(workflowId) }),
  });
}
