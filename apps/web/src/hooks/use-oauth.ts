import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface OAuthProviderSummary {
  provider: string;
  label: string;
}

/** So os provedores habilitados no ambiente atual (envs setadas) — ver apps/api/src/oauth/providers.ts. */
export function useOAuthProviders() {
  return useQuery({
    queryKey: ["oauth-providers"],
    queryFn: () => apiFetch<OAuthProviderSummary[]>("/oauth/providers"),
  });
}

/**
 * Devolve a URL de autorizacao — nunca redireciona sozinho. Quem chama abre
 * a URL (popup ou navegacao na mesma aba); o backend nunca navega o
 * navegador aqui porque o Bearer so viaja via apiFetch (ver spec-oauth-
 * credencial.md, achado 4).
 */
export function useStartOAuth() {
  return useMutation({
    mutationFn: ({ provider, name }: { provider: string; name?: string }) =>
      apiFetch<{ authorizeUrl: string }>(`/oauth/${provider}/start`, {
        method: "POST",
        body: name ? { name } : {},
      }),
  });
}
