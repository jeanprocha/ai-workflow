import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface Agent {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  provider: string;
  model: string;
  credential: string;
  temperature: number;
  tools: string[];
  createdAt: string;
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  systemPrompt: string;
  provider: string;
  model: string;
  credential?: string;
  temperature?: number;
  tools?: string[];
}

export interface AgentChatResponse {
  content: string;
  tokensTotal: number;
  costUsd: number;
  toolCallsUsed: string[];
}

const AGENTS_KEY = ["agents"];

export function useAgents() {
  return useQuery({
    queryKey: AGENTS_KEY,
    queryFn: () => apiFetch<Agent[]>("/agents"),
  });
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAgentInput) =>
      apiFetch<Agent>("/agents", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: AGENTS_KEY }),
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/agents/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: AGENTS_KEY }),
  });
}

export function useChatWithAgent(agentId: string) {
  return useMutation({
    mutationFn: (message: string) =>
      apiFetch<AgentChatResponse>(`/agents/${agentId}/chat`, {
        method: "POST",
        body: { message },
      }),
  });
}
