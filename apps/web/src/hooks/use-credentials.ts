import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface CredentialSummary {
  id: string;
  provider: string;
  name: string;
  lastFour: string | null;
  createdAt: string;
}

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
    mutationFn: (input: { provider: string; name: string; value: string }) =>
      apiFetch<CredentialSummary>("/credentials", { method: "POST", body: input }),
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
