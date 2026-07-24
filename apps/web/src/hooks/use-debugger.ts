import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface DiagnosisSuggestion {
  tipo: "retry" | "timeout" | "fallback";
  descricao: string;
  aplicavel: boolean;
  attempts?: number;
  backoffMs?: number;
  timeoutMs?: number;
}

export interface DiagnosisResult {
  suggestionId: string;
  nodeId: string;
  causaProvavel: string;
  sugestoes: DiagnosisSuggestion[];
}

export function useDiagnoseExecution(executionId: string) {
  return useMutation({
    mutationFn: (input: { provider: string; model: string; credential: string }) =>
      apiFetch<DiagnosisResult>(`/executions/${executionId}/diagnose`, {
        method: "POST",
        body: input,
      }),
  });
}

export function useApplyDiagnosisSuggestion() {
  return useMutation({
    mutationFn: ({
      suggestionId,
      suggestionIndex,
    }: {
      suggestionId: string;
      suggestionIndex: number;
    }) =>
      apiFetch(`/executions/diagnose/${suggestionId}/apply`, {
        method: "POST",
        body: { suggestionIndex },
      }),
  });
}
