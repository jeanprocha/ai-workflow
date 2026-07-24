import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface CostOptimizerSuggestion {
  suggestionId: string;
  workflowId: string;
  workflowName: string;
  nodeId: string;
  nodeLabel: string;
  currentProvider: string;
  currentModel: string;
  suggestedProvider: string;
  suggestedModel: string;
  sampleSize: number;
  avgCostUsd: number;
  estimatedSavingsPercent: number;
}

const KEY = ["cost-optimizer"];

export function useCostOptimizerSuggestions(enabled: boolean) {
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<CostOptimizerSuggestion[]>("/cost-optimizer/analyze"),
    enabled,
  });
}

export function useApplyCostSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (suggestionId: string) =>
      apiFetch(`/cost-optimizer/${suggestionId}/apply`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
