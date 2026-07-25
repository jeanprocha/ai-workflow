import type { APIRequestContext } from "@playwright/test";

export const API_URL = process.env.E2E_API_URL ?? "http://localhost:3333";
export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/** @playwright/test nao exporta um tipo nomeado pra isso — so aceita inline em `storageState`. */
export interface PlaywrightStorageState {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Strict" | "Lax" | "None";
  }>;
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
}

/**
 * Email unico por chamada — nao ha seed de usuario nem reset de banco entre
 * specs (ver docs/testing/plano-de-testes.md), entao cada teste que precisa
 * de uma conta nova gera a sua.
 */
export function uniqueEmail(tag = "e2e"): string {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${tag}+${stamp}@teste.local`;
}

export interface TestUser {
  name: string;
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export function buildTestUser(overrides: Partial<TestUser> = {}): TestUser {
  return {
    name: "Usuario E2E",
    email: uniqueEmail(),
    password: "SenhaForte123",
    ...overrides,
  };
}

/** Registra um usuario direto na API (sem passar pela UI) — mais rapido, pula o bcrypt duplo do form. */
export async function registerViaApi(
  request: APIRequestContext,
  user: TestUser,
): Promise<AuthTokens> {
  const response = await request.post(`${API_URL}/auth/register`, {
    data: user,
  });
  if (!response.ok()) {
    throw new Error(
      `registerViaApi falhou (${response.status()}): ${await response.text()}`,
    );
  }
  return response.json();
}

export async function loginViaApi(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<AuthTokens> {
  const response = await request.post(`${API_URL}/auth/login`, {
    data: { email, password },
  });
  if (!response.ok()) {
    throw new Error(
      `loginViaApi falhou (${response.status()}): ${await response.text()}`,
    );
  }
  return response.json();
}

async function fetchWorkspaceId(
  request: APIRequestContext,
  accessToken: string,
): Promise<string> {
  const response = await request.get(`${API_URL}/workspaces`, {
    headers: { Authorization: `Bearer ${accessToken}` },
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

/**
 * Monta um storageState do Playwright (cookies + localStorage) equivalente
 * ao que a UI produz apos login, pra fases futuras poderem pular o
 * login/register pela UI com `test.use({ storageState: await ... })`.
 * Espelha apps/web/src/lib/auth-storage.ts (chaves wf.accessToken/
 * wf.refreshToken/wf.workspaceId + cookie wf_session=1).
 */
export async function buildStorageState(
  request: APIRequestContext,
  tokens: AuthTokens,
): Promise<PlaywrightStorageState> {
  const workspaceId = await fetchWorkspaceId(request, tokens.accessToken);
  const origin = new URL(BASE_URL).origin;
  const hostname = new URL(BASE_URL).hostname;

  return {
    cookies: [
      {
        name: "wf_session",
        value: "1",
        domain: hostname,
        path: "/",
        expires: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
        httpOnly: false,
        secure: false,
        sameSite: "Lax",
      },
    ],
    origins: [
      {
        origin,
        localStorage: [
          { name: "wf.accessToken", value: tokens.accessToken },
          { name: "wf.refreshToken", value: tokens.refreshToken },
          { name: "wf.workspaceId", value: workspaceId },
        ],
      },
    ],
  };
}
