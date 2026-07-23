import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface VariableSummary {
  id: string;
  key: string;
  value: string | null;
  isSecret: boolean;
  scope: "global" | "environment" | "runtime";
  createdAt: string;
}

const VARIABLES_KEY = ["variables"];

export function useVariables() {
  return useQuery({
    queryKey: VARIABLES_KEY,
    queryFn: () => apiFetch<VariableSummary[]>("/variables"),
  });
}

export function useCreateVariable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { key: string; value: string; isSecret?: boolean }) =>
      apiFetch<VariableSummary>("/variables", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: VARIABLES_KEY }),
  });
}

export function useDeleteVariable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/variables/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: VARIABLES_KEY }),
  });
}
