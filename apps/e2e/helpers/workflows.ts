import type { APIRequestContext } from "@playwright/test";
import { API_URL, type AuthTokens } from "./auth";
import { workspaceHeaders } from "./settings";

export interface WorkflowSummary {
  id: string;
  name: string;
  status: "draft" | "active" | "archived";
  currentVersionId: string | null;
}

/** Grafo minimo valido: so um trigger manual — o suficiente pra rodar sem falhar no worker. */
export const MINIMAL_GRAPH = {
  nodes: [
    {
      id: "n1",
      type: "trigger.manual",
      category: "trigger",
      label: "Manual",
      position: { x: 0, y: 0 },
      config: {},
    },
  ],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
};

export async function createWorkflowViaApi(
  request: APIRequestContext,
  tokens: AuthTokens,
  workspaceId: string,
  name: string,
): Promise<WorkflowSummary> {
  const response = await request.post(`${API_URL}/workflows`, {
    headers: workspaceHeaders(tokens, workspaceId),
    data: { name },
  });
  if (!response.ok()) {
    throw new Error(`createWorkflowViaApi falhou (${response.status()})`);
  }
  return response.json() as Promise<WorkflowSummary>;
}

export async function saveGraphViaApi(
  request: APIRequestContext,
  tokens: AuthTokens,
  workspaceId: string,
  workflowId: string,
  graph: unknown = MINIMAL_GRAPH,
): Promise<void> {
  const response = await request.put(`${API_URL}/workflows/${workflowId}/graph`, {
    headers: workspaceHeaders(tokens, workspaceId),
    data: { graph },
  });
  if (!response.ok()) {
    throw new Error(`saveGraphViaApi falhou (${response.status()})`);
  }
}
