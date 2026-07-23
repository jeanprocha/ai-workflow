import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  getWorkspaceId,
  setTokens,
} from "./auth-storage";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(typeof body === "object" && body && "message" in body ? String(body.message) : "Erro na API");
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
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { body, withWorkspace = true, headers, ...rest } = options;

  async function doFetch(): Promise<Response> {
    const accessToken = getAccessToken();
    const workspaceId = getWorkspaceId();
    const finalHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...(headers as Record<string, string>),
    };
    if (accessToken) finalHeaders.Authorization = `Bearer ${accessToken}`;
    if (withWorkspace && workspaceId) finalHeaders["x-workspace-id"] = workspaceId;

    return fetch(`${API_URL}${path}`, {
      ...rest,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  let response = await doFetch();

  if (response.status === 401 && getRefreshToken()) {
    const refreshed = await tryRefresh();
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
    throw new ApiError(response.status, errorBody);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
