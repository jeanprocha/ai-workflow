import { useMutation } from "@tanstack/react-query";
import type { WorkflowGraph } from "@workflow/shared";
import { apiFetch } from "@/lib/api-client";

export interface GenerateWorkflowInput {
  prompt: string;
  provider: string;
  model: string;
  credential: string;
}

export interface GenerateWorkflowResult {
  suggestionId: string;
  graph: WorkflowGraph;
}

export function useGenerateWorkflow() {
  return useMutation({
    mutationFn: (input: GenerateWorkflowInput) =>
      apiFetch<GenerateWorkflowResult>("/autocomplete/generate", {
        method: "POST",
        body: input,
      }),
  });
}
