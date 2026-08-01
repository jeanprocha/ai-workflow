import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkflowGraph } from "@workflow/shared";
import { apiFetch } from "@/lib/api-client";

export interface Template {
  id: string;
  /** null = catalogo global (seed); preenchido = template do proprio workspace. */
  workspaceId: string | null;
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

export interface CreateTemplateInput {
  name: string;
  description?: string;
  category: string;
  workflowId: string;
  versionId?: string;
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTemplateInput) =>
      apiFetch<Template>("/templates", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  });
}

export interface UpdateTemplateInput {
  id: string;
  name?: string;
  description?: string;
  category?: string;
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateTemplateInput) =>
      apiFetch<Template>(`/templates/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/templates/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  });
}
