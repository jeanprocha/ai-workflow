import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface NodePresetSummary {
  id: string;
  nodeType: string;
  name: string;
  description: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

const NODE_PRESETS_KEY = ["node-presets"];

/** Sem `nodeType`, lista todas as predefinicoes do workspace (tela de Configuracoes). */
export function useNodePresets(nodeType?: string) {
  return useQuery({
    queryKey: [...NODE_PRESETS_KEY, nodeType ?? "all"],
    queryFn: () =>
      apiFetch<NodePresetSummary[]>(
        `/node-presets${nodeType ? `?nodeType=${encodeURIComponent(nodeType)}` : ""}`,
      ),
  });
}

export interface CreateNodePresetInput {
  nodeType: string;
  name: string;
  description?: string;
  config: Record<string, unknown>;
}

export function useCreateNodePreset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateNodePresetInput) =>
      apiFetch<NodePresetSummary>("/node-presets", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NODE_PRESETS_KEY }),
  });
}

export function useDeleteNodePreset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/node-presets/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NODE_PRESETS_KEY }),
  });
}
