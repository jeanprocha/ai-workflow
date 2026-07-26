import path from "node:path";
import type { APIRequestContext } from "@playwright/test";
import { API_URL, type AuthTokens } from "./auth";
import { workspaceHeaders } from "./settings";

/** Servidor MCP stdio zero-dependencia (2 tools: echo, soma) — ver apps/e2e/fixtures/mcp-echo-server.mjs. */
export const FIXTURE_SERVER_PATH = path.resolve(__dirname, "../fixtures/mcp-echo-server.mjs");

export type McpTransport = "stdio" | "sse" | "http";
export type McpServerStatus = "connecting" | "connected" | "disconnected" | "error";

export interface McpToolSummary {
  id: string;
  name: string;
  description: string | null;
  inputSchema: Record<string, unknown>;
}

export interface McpServerSummary {
  id: string;
  name: string;
  transport: McpTransport;
  command: string | null;
  args: string[] | null;
  env: Record<string, string> | null;
  url: string | null;
  headers: Record<string, string> | null;
  status: McpServerStatus;
  lastError: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  tools: McpToolSummary[];
}

export interface ConnectMcpServerPayload {
  name: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

/** Payload pronto pra conectar a fixture — sempre resulta em status "connected" com as tools echo/soma. */
export function fixtureServerPayload(name: string): ConnectMcpServerPayload {
  return { name, transport: "stdio", command: "node", args: [FIXTURE_SERVER_PATH] };
}

/** Payload que sempre falha o handshake (comando inexistente) — status "error" deterministico, sem rede. */
export function brokenServerPayload(name: string): ConnectMcpServerPayload {
  return { name, transport: "stdio", command: "comando-que-nao-existe-e2e" };
}

/** Setup rapido: servidor MCP conectado direto na API. */
export async function connectMcpServerViaApi(
  request: APIRequestContext,
  tokens: AuthTokens,
  workspaceId: string,
  payload: ConnectMcpServerPayload,
): Promise<McpServerSummary> {
  const response = await request.post(`${API_URL}/mcp/servers`, {
    headers: workspaceHeaders(tokens, workspaceId),
    data: payload,
  });
  if (!response.ok()) {
    throw new Error(
      `connectMcpServerViaApi falhou (${response.status()}): ${await response.text()}`,
    );
  }
  return response.json() as Promise<McpServerSummary>;
}
