import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

/** Tipo de um campo de conexao multi-campo — decide a coercao antes de virar JSON no backend. */
export type CredentialFieldType = "text" | "number" | "boolean";

/** Chave + tipo de um campo. O VALOR nunca vem do servidor. */
export interface CredentialFieldMeta {
  key: string;
  type: CredentialFieldType;
}

export interface CredentialSummary {
  id: string;
  provider: string;
  name: string;
  /** "secret" = valor unico; "fields" = varios pares chave/valor; "oauth" = conectado via authorization-code. */
  kind: "secret" | "fields" | "oauth";
  /** Preenchido so quando kind = "fields" — nunca traz valores. */
  fieldsMeta: CredentialFieldMeta[] | null;
  /** Ultimos 4 chars do valor; sempre null quando kind = "fields" ou "oauth". */
  lastFour: string | null;
  createdAt: string;
  updatedAt: string;
  /** Colunas em claro de kind = "oauth" — null pras demais. A UI deriva o badge disto, nunca do valor cifrado. */
  oauthProvider: string | null;
  oauthExpiresAt: string | null;
  oauthStatus: "active" | "error" | null;
  oauthLastError: string | null;
}

/** Campo com valor — so trafega do cliente PRA o servidor, nunca de volta. */
export interface CredentialFieldInput extends CredentialFieldMeta {
  value: string;
}

export interface CredentialSecretInput {
  kind?: "secret";
  value: string;
}

export interface CredentialFieldsInput {
  kind: "fields";
  fields: CredentialFieldInput[];
}

export type CredentialValueInput = CredentialSecretInput | CredentialFieldsInput;

const CREDENTIALS_KEY = ["credentials"];

export function useCredentials() {
  return useQuery({
    queryKey: CREDENTIALS_KEY,
    queryFn: () => apiFetch<CredentialSummary[]>("/credentials"),
  });
}

export function useCreateCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { provider: string; name: string } & CredentialValueInput) =>
      apiFetch<CredentialSummary>("/credentials", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CREDENTIALS_KEY }),
  });
}

/** Identificacao + (opcionalmente) um segredo novo, nas duas formas possiveis. */
export type UpdateCredentialInput = { id: string; provider?: string; name?: string } & (
  | CredentialSecretInput
  | CredentialFieldsInput
  // Sem `value`/`fields`: renomeia mantendo o segredo atual.
  | { kind?: undefined }
);

/**
 * Omitir `value`/`fields` renomeia sem tocar no segredo; mandar qualquer um
 * dos dois SUBSTITUI o segredo inteiro (nao ha atualizacao parcial — o valor
 * salvo nunca volta pro navegador, entao nao ha o que mesclar).
 */
export function useUpdateCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateCredentialInput) =>
      apiFetch<CredentialSummary>(`/credentials/${id}`, { method: "PATCH", body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CREDENTIALS_KEY }),
  });
}

export function useDeleteCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/credentials/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CREDENTIALS_KEY }),
  });
}
