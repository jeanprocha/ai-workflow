import { apiFetch } from "./api-client";
import { setTokens, setWorkspaceId, type TokenPair } from "./auth-storage";

interface Workspace {
  id: string;
  name: string;
  role: string;
}

async function bootstrapSession(tokens: TokenPair) {
  setTokens(tokens);
  const workspaces = await apiFetch<Workspace[]>("/workspaces", { withWorkspace: false });
  const first = workspaces[0];
  if (first) setWorkspaceId(first.id);
}

export async function login(email: string, password: string) {
  const tokens = await apiFetch<TokenPair>("/auth/login", {
    method: "POST",
    body: { email, password },
    withWorkspace: false,
    handleAuthErrors: false,
  });
  await bootstrapSession(tokens);
}

export async function register(name: string, email: string, password: string) {
  const tokens = await apiFetch<TokenPair>("/auth/register", {
    method: "POST",
    body: { name, email, password },
    withWorkspace: false,
    handleAuthErrors: false,
  });
  await bootstrapSession(tokens);
}
