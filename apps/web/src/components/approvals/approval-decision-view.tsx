"use client";

import { useState } from "react";
import { CheckCircle2, Clock, ShieldAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useApprovalStatus, useDecideApprovalByToken } from "@/hooks/use-approvals";
import { ApiError, errorMessage } from "@/lib/errors";
import { useDictionary, useLocale } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";

function isPastExpiry(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-6 text-center">
        {children}
      </div>
    </div>
  );
}

export function ApprovalDecisionView({ token }: { token: string }) {
  const t = useDictionary().approvals.publicPage;
  const locale = useLocale();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const status = useApprovalStatus(token);
  const decide = useDecideApprovalByToken(token);

  async function onDecide(decision: "approved" | "rejected") {
    setError(null);
    try {
      await decide.mutateAsync({
        decision,
        comment: comment.trim() || undefined,
      });
    } catch (err) {
      setError(errorMessage(err, t.genericError));
    }
  }

  if (status.isLoading) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">{t.loading}</p>
      </Shell>
    );
  }

  const approval = status.data;
  // Mesma resposta pra "token invalido" (404) e "erro generico" — o backend
  // (ApprovePublicController) ja normaliza tudo isso numa unica mensagem de
  // recusa; aqui so decidimos se HA dado pra mostrar ou nao.
  if (status.error instanceof ApiError || !approval) {
    return (
      <Shell>
        <ShieldAlert
          className="mx-auto size-8 text-muted-foreground"
          strokeWidth={1.5}
        />
        <div className="space-y-1">
          <h1 className="text-md font-medium text-foreground">
            {t.invalidTitle}
          </h1>
          <p className="text-sm text-muted-foreground">{t.invalidDescription}</p>
        </div>
      </Shell>
    );
  }

  const isExpired = !approval.decidedAt && isPastExpiry(approval.expiresAt);

  if (isExpired) {
    return (
      <Shell>
        <Clock className="mx-auto size-8 text-muted-foreground" strokeWidth={1.5} />
        <div className="space-y-1">
          <h1 className="text-md font-medium text-foreground">
            {t.expiredTitle}
          </h1>
          <p className="text-sm text-muted-foreground">{t.expiredDescription}</p>
        </div>
      </Shell>
    );
  }

  if (approval.decidedAt) {
    const approved = approval.decision === "approved";
    return (
      <Shell>
        {approved ? (
          <CheckCircle2 className="mx-auto size-8 text-success" strokeWidth={1.5} />
        ) : (
          <XCircle className="mx-auto size-8 text-danger" strokeWidth={1.5} />
        )}
        <div className="space-y-1">
          <h1 className="text-md font-medium text-foreground">{t.decidedTitle}</h1>
          <p className="text-sm text-muted-foreground">
            {approved ? t.decidedApproved : t.decidedRejected}
          </p>
        </div>
        {approval.comment && (
          <div className="rounded-md border border-border bg-muted p-3 text-left">
            <p className="text-xs font-medium text-muted-foreground">
              {t.decidedCommentLabel}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
              {approval.comment}
            </p>
          </div>
        )}
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="space-y-1">
        <h1 className="text-md font-medium text-foreground">{approval.title}</h1>
        <p className="text-xs text-muted-foreground">
          {t.expiresLabel(formatDateTime(approval.expiresAt, locale))}
        </p>
      </div>

      <div className="space-y-1.5 text-left">
        <Label htmlFor="approval-comment">{t.commentLabel}</Label>
        <Textarea
          id="approval-comment"
          rows={3}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder={t.commentPlaceholder}
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => onDecide("rejected")}
          disabled={decide.isPending}
        >
          {decide.isPending ? t.submitting : t.rejectButton}
        </Button>
        <Button
          className="flex-1"
          onClick={() => onDecide("approved")}
          disabled={decide.isPending}
        >
          {decide.isPending ? t.submitting : t.approveButton}
        </Button>
      </div>
    </Shell>
  );
}
