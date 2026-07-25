"use client";

import { useState } from "react";
import { toast } from "sonner";
import { History, RotateCcw } from "lucide-react";
import { diffGraphs, type GraphDiff } from "@workflow/shared/graph-diff";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useRollbackWorkflow,
  useWorkflowVersion,
  useWorkflowVersions,
  type WorkflowVersionSummary,
} from "@/hooks/use-workflow-versions";
import { errorMessage } from "@/lib/errors";
import { useDictionary, useLocale } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";

function DiffSummary({ diff }: { diff: GraphDiff }) {
  const t = useDictionary().editor.versionHistory;
  const entries = Object.entries(diff.nodes).filter(([, entry]) => entry.status !== "unchanged");
  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground">{t.noDiff}</p>;
  }
  return (
    <div className="space-y-1">
      {entries.map(([nodeId, entry]) => {
        const label = (entry.after ?? entry.before)?.label ?? nodeId;
        const style =
          entry.status === "added"
            ? "text-success"
            : entry.status === "removed"
              ? "text-danger"
              : "text-warning";
        const prefix = entry.status === "added" ? "+" : entry.status === "removed" ? "-" : "~";
        return (
          <p key={nodeId} className={`font-mono text-xs ${style}`}>
            {prefix} {label}
          </p>
        );
      })}
    </div>
  );
}

function VersionRow({
  version,
  currentGraphVersionId,
  workflowId,
  onRestored,
}: {
  version: WorkflowVersionSummary;
  currentGraphVersionId: string;
  workflowId: string;
  onRestored: () => void;
}) {
  const t = useDictionary();
  const locale = useLocale();
  const [showDiff, setShowDiff] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { data: thisVersion } = useWorkflowVersion(workflowId, showDiff ? version.id : null);
  const { data: baseVersion } = useWorkflowVersion(
    workflowId,
    showDiff ? currentGraphVersionId : null,
  );
  const rollback = useRollbackWorkflow(workflowId);

  const diff =
    thisVersion && baseVersion ? diffGraphs(baseVersion.graph, thisVersion.graph) : null;

  async function onConfirmRollback() {
    try {
      await rollback.mutateAsync(version.id);
      toast.success(t.editor.versionHistory.restoredToast(version.versionNumber));
      setConfirmOpen(false);
      onRestored();
    } catch (error) {
      toast.error(errorMessage(error, t.editor.versionHistory.restoreErrorFallback));
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">
            v{version.versionNumber}
            {version.isCurrent && (
              <span className="ml-2 rounded-full bg-accent-subtle px-2 py-0.5 text-xs text-primary">
                {t.editor.versionHistory.current}
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDateTime(version.createdAt, locale)} · {version.createdByName}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowDiff((v) => !v)}>
            {showDiff ? t.editor.versionHistory.hideDiff : t.editor.versionHistory.viewDiff}
          </Button>
          {!version.isCurrent && (
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
              {t.editor.versionHistory.restore}
            </Button>
          )}
        </div>
      </div>

      {showDiff && (
        <div className="mt-3 border-t border-border pt-3">
          {diff ? <DiffSummary diff={diff} /> : <Skeleton className="h-12 rounded-lg" />}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t.editor.versionHistory.confirmTitle(version.versionNumber)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t.editor.versionHistory.confirmDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmRollback}>
              {t.editor.versionHistory.restore}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function VersionHistoryDialog({
  workflowId,
  currentVersionId,
}: {
  workflowId: string;
  currentVersionId: string;
}) {
  const t = useDictionary().editor.versionHistory;
  const [open, setOpen] = useState(false);
  const { data: versions, isLoading } = useWorkflowVersions(workflowId, open);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <History className="h-3.5 w-3.5" strokeWidth={1.5} />
        {t.openButton}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t.dialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {isLoading && (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 rounded-lg" />
                ))}
              </div>
            )}
            {versions?.map((version) => (
              <VersionRow
                key={version.id}
                version={version}
                workflowId={workflowId}
                currentGraphVersionId={currentVersionId}
                onRestored={() => window.location.reload()}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
