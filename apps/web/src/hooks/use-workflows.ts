import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Workflow } from "@workflow/shared";
import { apiFetch } from "@/lib/api-client";

const WORKFLOWS_KEY = ["workflows"];

export function useWorkflows() {
  return useQuery({
    queryKey: WORKFLOWS_KEY,
    queryFn: () => apiFetch<Workflow[]>("/workflows"),
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
