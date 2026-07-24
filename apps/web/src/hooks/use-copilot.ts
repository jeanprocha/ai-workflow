import { useMutation } from "@tanstack/react-query";
import type { WorkflowGraph } from "@workflow/shared";
import { apiFetch } from "@/lib/api-client";

export interface CopilotHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CopilotChatResult {
  content: string;
  suggestionId?: string;
  proposedGraph?: WorkflowGraph;
}

export function useCopilotChat(workflowId: string) {
  return useMutation({
    mutationFn: (input: {
      message: string;
      provider: string;
      model: string;
      credential: string;
      history?: CopilotHistoryMessage[];
    }) =>
      apiFetch<CopilotChatResult>(`/workflows/${workflowId}/copilot/chat`, {
        method: "POST",
        body: input,
      }),
  });
}

export function useApplyCopilotSuggestion(workflowId: string) {
  return useMutation({
    mutationFn: (suggestionId: string) =>
      apiFetch(`/workflows/${workflowId}/copilot/suggestions/${suggestionId}/apply`, {
        method: "POST",
      }),
  });
}
