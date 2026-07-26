import type { APIRequestContext } from "@playwright/test";
import { API_URL, type AuthTokens } from "./auth";

/** Headers padrao de request autenticada com workspace — todo endpoint de Settings exige os dois. */
export function workspaceHeaders(tokens: AuthTokens, workspaceId: string) {
  return {
    Authorization: `Bearer ${tokens.accessToken}`,
    "x-workspace-id": workspaceId,
  };
}

export async function fetchWorkspaceId(
  request: APIRequestContext,
  tokens: AuthTokens,
): Promise<string> {
  const response = await request.get(`${API_URL}/workspaces`, {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
  });
  if (!response.ok()) {
    throw new Error(`GET /workspaces falhou (${response.status()})`);
  }
  const workspaces = (await response.json()) as Array<{ id: string }>;
  if (!workspaces[0]) {
    throw new Error("Usuario sem workspace — registro nao provisionou um.");
  }
  return workspaces[0].id;
}

/** Setup rapido: credencial criada direto na API (teste de UI que so precisa de uma existente). */
export async function createCredentialViaApi(
  request: APIRequestContext,
  tokens: AuthTokens,
  workspaceId: string,
  data: { provider: string; name: string; value: string },
): Promise<{ id: string }> {
  const response = await request.post(`${API_URL}/credentials`, {
    headers: workspaceHeaders(tokens, workspaceId),
    data,
  });
  if (!response.ok()) {
    throw new Error(`createCredentialViaApi falhou (${response.status()})`);
  }
  return response.json() as Promise<{ id: string }>;
}

/** Setup rapido: variavel criada direto na API. */
export async function createVariableViaApi(
  request: APIRequestContext,
  tokens: AuthTokens,
  workspaceId: string,
  data: {
    key: string;
    value: string;
    isSecret?: boolean;
    scope?: "global" | "environment" | "runtime";
  },
): Promise<{ id: string }> {
  const response = await request.post(`${API_URL}/variables`, {
    headers: workspaceHeaders(tokens, workspaceId),
    data,
  });
  if (!response.ok()) {
    throw new Error(`createVariableViaApi falhou (${response.status()})`);
  }
  return response.json() as Promise<{ id: string }>;
}
