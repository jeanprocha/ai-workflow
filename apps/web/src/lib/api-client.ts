import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  getWorkspaceId,
  setTokens,
} from "./auth-storage";
import { getLocale } from "./i18n/store";
import { ApiError, NetworkError, TimeoutError } from "./errors";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";
const REQUEST_TIMEOUT_MS = 30_000;

export { ApiError };

declare global {
  interface Window {
    /** Injetado pelo Playwright via addInitScript (apps/e2e/helpers/fixtures.ts, Fase 7). */
    __E2E_TEST_RUN__?: string;
  }
}

let refreshPromise: Promise<boolean> | null = null;

/**
 * `false` = refresh confirmado invalido pelo servidor (sessao realmente
 * acabou). Falha de REDE (fetch rejeitou antes de qualquer resposta) lanca
 * NetworkError em vez de virar `false` — sem essa distincao, uma queda de
 * conexao momentanea durante o refresh derrubava a sessao do usuario
 * (clearSession + redirect pro /login) por um problema que nao tinha nada a
 * ver com o token em si. Ver o bloco de 401 em apiFetch().
 */
/** Exportado pra sse-client.ts renovar o token antes de reconectar apos uma queda. */
export async function tryRefresh(): Promise<boolean> {
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
      .catch((error) => {
        if (error instanceof TypeError) throw new NetworkError(error);
        throw error;
      })
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

    const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal = rest.signal ? AbortSignal.any([rest.signal, timeoutSignal]) : timeoutSignal;

    try {
      return await fetch(`${API_URL}${path}`, {
        ...rest,
        signal,
        headers: finalHeaders,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      // "TimeoutError" == nosso AbortSignal.timeout(); "AbortError" == abort
      // do CALLER (unmount, cancelamento do React Query) — esse propaga como
      // esta, quem escuta signal.aborted sabe reconhecer. TypeError == fetch
      // rejeitou antes de qualquer resposta (offline, DNS, CORS, conexao
      // recusada) — sem essa distincao, os 3 casos apareciam identicos pro
      // caller como "deu erro", sem forma de decidir se vale a pena retentar.
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new TimeoutError();
      }
      if (error instanceof TypeError) {
        throw new NetworkError(error);
      }
      throw error;
    }
  }

  let response = await doFetch();

  if (response.status === 401 && handleAuthErrors) {
    if (getRefreshToken()) {
      // Se tryRefresh() lancar NetworkError, propaga direto pro caller sem
      // passar pelo else abaixo — uma queda de rede aqui NAO significa que o
      // refresh token e invalido, entao nao deve limpar a sessao.
      const refreshed = await tryRefresh();
      if (refreshed) {
        response = await doFetch();
      } else {
        clearSession();
        if (typeof window !== "undefined") window.location.href = "/login";
      }
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

  // Nao confiar so no status 204: os endpoints de DELETE (credentials,
  // variables) retornam 200 com corpo VAZIO (controller void no Nest), e
  // response.json() lanca em corpo vazio — o que fazia todo delete via UI
  // "falhar" (toast de erro, lista sem atualizar) mesmo com o servidor
  // deletando de verdade. Bug real pego pela suite E2E da Fase 02.
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
