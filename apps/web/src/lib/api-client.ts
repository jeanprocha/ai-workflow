import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  getWorkspaceId,
  setTokens,
} from "./auth-storage";
import { getLocale } from "./i18n/store";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    /** Mesmo valor enviado no header x-request-id — correlaciona com os logs do servidor (GET /debug/logs). */
    public requestId?: string,
  ) {
    super(typeof body === "object" && body && "message" in body ? String(body.message) : "Erro na API");
  }
}

declare global {
  interface Window {
    /** Injetado pelo Playwright via addInitScript (apps/e2e/helpers/fixtures.ts, Fase 7). */
    __E2E_TEST_RUN__?: string;
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) return false;
        const tokens = await res.json();
        setTokens(tokens);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Inclui o header x-workspace-id (padrao: true). */
  withWorkspace?: boolean;
  /**
   * Desliga o fluxo de refresh/redirect automatico em 401 (padrao: true).
   * Usado por /auth/login e /auth/register: la, 401 significa credenciais
   * erradas, nao sessao expirada — nao deve limpar sessao nem redirecionar.
   */
  handleAuthErrors?: boolean;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { body, withWorkspace = true, handleAuthErrors = true, headers, ...rest } = options;

  // Mesmo id nas duas tentativas (original + retry pos-refresh de 401) — e
  // logicamente a mesma operacao do ponto de vista de quem chamou.
  const requestId = crypto.randomUUID();
  const testRun = typeof window !== "undefined" ? window.__E2E_TEST_RUN__ : undefined;

  async function doFetch(): Promise<Response> {
    const accessToken = getAccessToken();
    const workspaceId = getWorkspaceId();
    const finalHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "x-lang": getLocale(),
      "x-request-id": requestId,
      ...(headers as Record<string, string>),
    };
    if (testRun) finalHeaders["x-test-run"] = testRun;
    if (accessToken) finalHeaders.Authorization = `Bearer ${accessToken}`;
    if (withWorkspace && workspaceId) finalHeaders["x-workspace-id"] = workspaceId;

    return fetch(`${API_URL}${path}`, {
      ...rest,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  let response = await doFetch();

  if (response.status === 401 && handleAuthErrors) {
    const refreshed = getRefreshToken() ? await tryRefresh() : false;
    if (refreshed) {
      response = await doFetch();
    } else {
      clearSession();
      if (typeof window !== "undefined") window.location.href = "/login";
    }
  }

  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    const errorBody = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : await response.text();
    throw new ApiError(response.status, errorBody, requestId);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
