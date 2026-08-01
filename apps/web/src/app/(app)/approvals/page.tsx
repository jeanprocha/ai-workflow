"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useApprovals,
  useDecideApproval,
  type ApprovalListItem,
} from "@/hooks/use-approvals";
import { errorMessage } from "@/lib/errors";
import { useDictionary, useLocale, type Dictionary } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type DerivedStatus = "pending" | "expired" | "approved" | "rejected" | "void";

function deriveStatus(approval: ApprovalListItem): DerivedStatus {
  if (approval.decision) return approval.decision;
  return new Date(approval.expiresAt).getTime() <= Date.now() ? "expired" : "pending";
}

function statusLabel(t: Dictionary, status: DerivedStatus): string {
  const labels = t.approvals.inbox;
  return {
    pending: labels.statusPending,
    expired: labels.statusExpired,
    approved: labels.statusApproved,
    rejected: labels.statusRejected,
    void: labels.statusVoid,
  }[status];
}

const STATUS_STYLES: Record<DerivedStatus, string> = {
  pending: "bg-warning-subtle text-warning",
  expired: "bg-muted text-muted-foreground",
  approved: "bg-success-subtle text-success",
  rejected: "bg-danger-subtle text-danger",
  void: "bg-muted text-muted-foreground",
};

function StatusPill({ status, t }: { status: DerivedStatus; t: Dictionary }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
      )}
    >
      {statusLabel(t, status)}
    </span>
  );
}

function ApprovalRow({
  approval,
  active,
  onSelect,
  t,
  locale,
}: {
  approval: ApprovalListItem;
  active: boolean;
  onSelect: () => void;
  t: Dictionary;
  locale: ReturnType<typeof useLocale>;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full flex-col gap-1 border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-muted",
        active && "bg-muted",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-foreground">
          {approval.title}
        </span>
        <StatusPill status={deriveStatus(approval)} t={t} />
      </div>
      <span className="text-xs text-muted-foreground">
        {formatDateTime(approval.createdAt, locale)}
      </span>
    </button>
  );
}

function ApprovalDetail({
  approval,
  onBack,
}: {
  approval: ApprovalListItem;
  onBack: () => void;
}) {
  const t = useDictionary();
  const inboxT = t.approvals.inbox;
  const locale = useLocale();
  const [comment, setComment] = useState("");
  const decide = useDecideApproval();
  const status = deriveStatus(approval);

  async function onDecide(decision: "approved" | "rejected") {
    try {
      await decide.mutateAsync({
        id: approval.id,
        decision,
        comment: comment.trim() || undefined,
      });
      toast.success(
        decision === "approved" ? inboxT.approveSuccessToast : inboxT.rejectSuccessToast,
      );
      setComment("");
    } catch (error) {
      toast.error(errorMessage(error, inboxT.decideErrorFallback));
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 md:hidden">
        <Button variant="ghost" size="icon-sm" aria-label={inboxT.backToList} onClick={onBack}>
          <ArrowLeft className="size-4" strokeWidth={1.5} />
        </Button>
        <span className="text-sm font-medium text-foreground">{approval.title}</span>
      </div>

      <div className="space-y-4 p-4">
        <div className="hidden items-center justify-between gap-2 md:flex">
          <h1 className="text-lg font-semibold text-foreground">{approval.title}</h1>
          <StatusPill status={status} t={t} />
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground">{inboxT.nodeLabel}</p>
            <p className="font-mono text-foreground">{approval.nodeId}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{inboxT.expiresLabel}</p>
            <p className="text-foreground">{formatDateTime(approval.expiresAt, locale)}</p>
          </div>
          <div className="col-span-2">
            <Link
              href={`/executions/${approval.executionId}`}
              className="text-primary hover:underline"
            >
              {inboxT.executionLink}
            </Link>
          </div>
        </div>

        {approval.decidedAt ? (
          <div className="space-y-2 rounded-lg border border-border bg-muted p-3">
            <p className="text-xs text-muted-foreground">
              {approval.decidedBy
                ? inboxT.decidedByLabel(approval.decidedBy)
                : inboxT.decidedByLabel("—")}{" "}
              {inboxT.decidedAtLabel(formatDateTime(approval.decidedAt, locale))}
            </p>
            {approval.comment && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {inboxT.commentLabel}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                  {approval.comment}
                </p>
              </div>
            )}
          </div>
        ) : status === "expired" ? (
          <p className="text-sm text-muted-foreground">{inboxT.statusExpired}</p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="decide-comment">{inboxT.commentLabel}</Label>
              <Textarea
                id="decide-comment"
                rows={3}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder={inboxT.commentPlaceholder}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => onDecide("rejected")}
                disabled={decide.isPending}
              >
                {inboxT.rejectButton}
              </Button>
              <Button
                className="flex-1"
                onClick={() => onDecide("approved")}
                disabled={decide.isPending}
              >
                {inboxT.approveButton}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ApprovalsPage() {
  const t = useDictionary();
  const inboxT = t.approvals.inbox;
  const locale = useLocale();
  const [selected, setSelected] = useState<string | null>(null);
  const approvals = useApprovals();

  const list = approvals.data ?? [];
  const selectedApproval = list.find((approval) => approval.id === selected) ?? null;

  if (approvals.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col md:h-[calc(100dvh-4rem)] md:flex-row">
      <div
        className={cn(
          "flex w-full flex-col border-border md:w-80 md:shrink-0 md:border-r",
          selected && "hidden md:flex",
        )}
      >
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <ShieldCheck className="size-4 text-primary" strokeWidth={1.5} />
          <span className="text-sm font-medium text-foreground">{inboxT.title}</span>
        </header>
        {list.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 px-4 text-center">
            <p className="text-sm font-medium text-foreground">{inboxT.emptyTitle}</p>
            <p className="text-sm text-muted-foreground">{inboxT.emptyDescription}</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {list.map((approval) => (
              <ApprovalRow
                key={approval.id}
                approval={approval}
                active={approval.id === selected}
                onSelect={() => setSelected(approval.id)}
                t={t}
                locale={locale}
              />
            ))}
          </div>
        )}
      </div>

      <div
        className={cn(
          "flex-1",
          !selectedApproval && "hidden md:flex md:items-center md:justify-center",
        )}
      >
        {selectedApproval ? (
          <ApprovalDetail approval={selectedApproval} onBack={() => setSelected(null)} />
        ) : (
          <p className="hidden text-sm text-muted-foreground md:block">
            {inboxT.selectHint}
          </p>
        )}
      </div>
    </div>
  );
}
