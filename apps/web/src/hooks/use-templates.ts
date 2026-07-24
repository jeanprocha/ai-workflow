import { useMutation, useQuery } from "@tanstack/react-query";
import type { WorkflowGraph } from "@workflow/shared";
import { apiFetch } from "@/lib/api-client";

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  graph: WorkflowGraph;
  createdAt: string;
}

export interface ClonedWorkflow {
  id: string;
  name: string;
}

const TEMPLATES_KEY = ["templates"];

export function useTemplates() {
  return useQuery({
    queryKey: TEMPLATES_KEY,
    queryFn: () => apiFetch<Template[]>("/templates"),
  });
}

export function useUseTemplate() {
  return useMutation({
    mutationFn: (templateId: string) =>
      apiFetch<ClonedWorkflow>(`/templates/${templateId}/use`, { method: "POST" }),
  });
}
