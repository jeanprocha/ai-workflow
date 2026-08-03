import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export type McpTransport = "stdio" | "sse" | "http";
export type McpServerStatus = "connecting" | "connected" | "disconnected" | "error";

export interface McpToolInfo {
  id: string;
  name: string;
  description: string | null;
  inputSchema: Record<string, unknown>;
}

export interface McpServer {
  id: string;
  name: string;
  transport: McpTransport;
  command: string | null;
  args: string[] | null;
  url: string | null;
  /**
   * Só os NOMES das chaves de env/headers — os valores são secrets
   * criptografados e nunca voltam da API (ADR-007). Mandar env/headers no POST
   * continua funcionando; o que muda é que não dá pra lê-los de volta.
   */
  envKeys: string[];
  headerKeys: string[];
  status: McpServerStatus;
  lastError: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  tools: McpToolInfo[];
}

export interface ConnectMcpServerInput {
  name: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

const KEY = ["mcp-servers"];

export function useMcpServers() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<McpServer[]>("/mcp/servers"),
    refetchInterval: 15000,
  });
}

export function useConnectMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ConnectMcpServerInput) =>
      apiFetch<McpServer>("/mcp/servers", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useReconnectMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<McpServer>(`/mcp/servers/${id}/reconnect`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDisconnectMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/mcp/servers/${id}/disconnect`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRemoveMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/mcp/servers/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
