import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface SearchResults {
  workflows: Array<{ id: string; name: string }>;
  nodes: Array<{ workflowId: string; workflowName: string; nodeId: string; nodeLabel: string }>;
  executions: Array<{ id: string; workflowName: string; status: string; startedAt: string }>;
  templates: Array<{ id: string; name: string }>;
  agents: Array<{ id: string; name: string }>;
}

export function useGlobalSearch(query: string) {
  return useQuery({
    queryKey: ["search", query],
    queryFn: () => apiFetch<SearchResults>(`/search?q=${encodeURIComponent(query)}`),
    enabled: query.trim().length > 0,
  });
}
