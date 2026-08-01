import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

/** Endpoint publico (sem auth) — sempre com withWorkspace/handleAuthErrors desligados. */
const PUBLIC_OPTS = { withWorkspace: false, handleAuthErrors: false } as const;

export type ApprovalDecisionValue = "approved" | "rejected" | "void";

export interface PublicApprovalStatus {
  id: string;
  title: string;
  expiresAt: string;
  decidedAt: string | null;
  decision: ApprovalDecisionValue | null;
  comment: string | null;
}

export interface ApprovalListItem {
  id: string;
  executionId: string;
  nodeId: string;
  title: string;
  expiresAt: string;
  onTimeout: "approve" | "reject";
  decidedAt: string | null;
  decision: ApprovalDecisionValue | null;
  decidedBy: string | null;
  comment: string | null;
  createdAt: string;
}

// --- Publico (/approve/[token]) ---

export function useApprovalStatus(token: string) {
  return useQuery({
    queryKey: ["public-approval", token],
    queryFn: () => apiFetch<PublicApprovalStatus>(`/approve/${token}`, PUBLIC_OPTS),
    meta: { suppressErrorToast: true },
  });
}

export function useDecideApprovalByToken(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      decision,
      comment,
    }: {
      decision: "approved" | "rejected";
      comment?: string;
    }) =>
      apiFetch(`/approve/${token}/decide`, {
        method: "POST",
        body: { decision, comment },
        ...PUBLIC_OPTS,
      }),
    // onSettled (nao onSuccess): um 409 aqui quase sempre significa que o
    // estado mudou no servidor (decidido/expirado entre o load da pagina e
    // o clique) — refetch mesmo no erro mostra a verdade atual em vez de um
    // formulario "pendente" desatualizado ao lado da mensagem de erro.
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["public-approval", token] }),
  });
}

// --- Autenticado (/approvals) ---

export function useApprovals() {
  return useQuery({
    queryKey: ["approvals"],
    queryFn: () => apiFetch<ApprovalListItem[]>("/approvals"),
    refetchInterval: 15_000,
  });
}

export function useDecideApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      decision,
      comment,
    }: {
      id: string;
      decision: "approved" | "rejected";
      comment?: string;
    }) =>
      apiFetch(`/approvals/${id}/${decision === "approved" ? "approve" : "reject"}`, {
        method: "POST",
        body: { comment },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["approvals"] }),
  });
}
