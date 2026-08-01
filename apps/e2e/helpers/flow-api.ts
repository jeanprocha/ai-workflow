import type { APIRequestContext } from "@playwright/test";
import { API_URL, type AuthTokens } from "./auth";
import { workspaceHeaders } from "./settings";

export interface FlowApiKeySummary {
  id: string;
  name: string;
  lastFour: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface FlowApiKeyCreated extends FlowApiKeySummary {
  key: string;
}

export async function createFlowApiKeyViaApi(
  request: APIRequestContext,
  tokens: AuthTokens,
  workspaceId: string,
  workflowId: string,
  name = "e2e",
): Promise<FlowApiKeyCreated> {
  const response = await request.post(`${API_URL}/workflows/${workflowId}/api-keys`, {
    headers: workspaceHeaders(tokens, workspaceId),
    data: { name },
  });
  if (!response.ok()) {
    throw new Error(`createFlowApiKeyViaApi falhou (${response.status()})`);
  }
  return response.json() as Promise<FlowApiKeyCreated>;
}

export async function listFlowApiKeysViaApi(
  request: APIRequestContext,
  tokens: AuthTokens,
  workspaceId: string,
  workflowId: string,
): Promise<FlowApiKeySummary[]> {
  const response = await request.get(`${API_URL}/workflows/${workflowId}/api-keys`, {
    headers: workspaceHeaders(tokens, workspaceId),
  });
  if (!response.ok()) {
    throw new Error(`listFlowApiKeysViaApi falhou (${response.status()})`);
  }
  return response.json() as Promise<FlowApiKeySummary[]>;
}

export async function revokeFlowApiKeyViaApi(
  request: APIRequestContext,
  tokens: AuthTokens,
  workspaceId: string,
  workflowId: string,
  keyId: string,
) {
  const response = await request.delete(
    `${API_URL}/workflows/${workflowId}/api-keys/${keyId}`,
    { headers: workspaceHeaders(tokens, workspaceId) },
  );
  return { status: response.status() };
}

export interface FlowApiEnvelope {
  executionId: string;
  status: string;
  versionId: string;
  output: unknown;
  error: string | null;
  durationMs: number | null;
  resultUrl?: string;
}

/**
 * `timeout: 60_000` explicito: o default do Playwright (30s) empata com o
 * timeout maximo do proprio invoke sincrono (FLOW_API_MAX_TIMEOUT_MS=60s),
 * o que viraria flake — o request do Playwright podia abortar ANTES da API
 * degradar sozinha pra 202.
 */
export async function invokeFlowApi(
  request: APIRequestContext,
  workflowId: string,
  rawKey: string,
  input: unknown = {},
  options: { mode?: "async"; timeoutMs?: number } = {},
): Promise<{ status: number; body: FlowApiEnvelope }> {
  const query: string[] = [];
  if (options.mode) query.push(`mode=${options.mode}`);
  if (options.timeoutMs) query.push(`timeoutMs=${options.timeoutMs}`);
  const qs = query.length ? `?${query.join("&")}` : "";
  const response = await request.post(`${API_URL}/v1/flows/${workflowId}/invoke${qs}`, {
    headers: rawKey ? { Authorization: `Bearer ${rawKey}` } : undefined,
    data: input,
    timeout: 60_000,
  });
  return { status: response.status(), body: await response.json() };
}

export async function getFlowApiExecution(
  request: APIRequestContext,
  workflowId: string,
  executionId: string,
  rawKey: string,
): Promise<{ status: number; body: FlowApiEnvelope }> {
  const response = await request.get(
    `${API_URL}/v1/flows/${workflowId}/executions/${executionId}`,
    { headers: { Authorization: `Bearer ${rawKey}` }, timeout: 60_000 },
  );
  return { status: response.status(), body: await response.json() };
}

/** trigger.webhook -> api.respond — grafo minimo pro invoke publicado sincrono/assincrono. */
export function webhookRespondGraph() {
  return {
    nodes: [
      {
        id: "n1",
        type: "trigger.webhook",
        category: "trigger",
        label: "Webhook",
        position: { x: 0, y: 0 },
        config: { webhookId: "" },
      },
      {
        id: "n2",
        type: "api.respond",
        category: "api",
        label: "Responder da API",
        position: { x: 320, y: 0 },
        config: {},
      },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2" }],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

/**
 * trigger.webhook fan-out (SEM merge) pra dois filhos diretos na mesma onda:
 * n2 (logic.log com mensagem fixa) e n3 (api.respond, echo do input). Prova
 * que o output publicado e o do api.respond mesmo quando ele NAO e o ultimo
 * node processado na onda — sem hasRespondOutput, o resultado dependeria da
 * ordem de iteracao do Promise.all e podia vir "branch-nao-deveria-vencer"
 * (teste vacuo evitado: as duas saidas possiveis sao literais diferentes).
 */
export function webhookRespondFanOutGraph() {
  return {
    nodes: [
      {
        id: "n1",
        type: "trigger.webhook",
        category: "trigger",
        label: "Webhook",
        position: { x: 0, y: 0 },
        config: { webhookId: "" },
      },
      {
        id: "n2",
        type: "logic.log",
        category: "logic",
        label: "Log",
        position: { x: 320, y: -80 },
        config: { message: "branch-nao-deveria-vencer" },
      },
      {
        id: "n3",
        type: "api.respond",
        category: "api",
        label: "Responder da API",
        position: { x: 320, y: 80 },
        config: {},
      },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n1", target: "n3" },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}
