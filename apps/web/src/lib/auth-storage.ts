const ACCESS_TOKEN_KEY = "wf.accessToken";
const REFRESH_TOKEN_KEY = "wf.refreshToken";
const WORKSPACE_ID_KEY = "wf.workspaceId";
/** Cookie leve (nao httpOnly) so para o middleware saber se ha sessao. */
const SESSION_COOKIE = "wf_session";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(WORKSPACE_ID_KEY);
}

export function setWorkspaceId(workspaceId: string) {
  localStorage.setItem(WORKSPACE_ID_KEY, workspaceId);
}

export function setTokens(tokens: TokenPair) {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  document.cookie = `${SESSION_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;
}

export function clearSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(WORKSPACE_ID_KEY);
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`;
}
