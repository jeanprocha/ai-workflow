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
import { ApiError } from "@/lib/api-client";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function DiffSummary({ diff }: { diff: GraphDiff }) {
  const entries = Object.entries(diff.nodes).filter(([, entry]) => entry.status !== "unchanged");
  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground">Sem diferencas de nodes entre as versoes.</p>;
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
      toast.success(`Restaurado para a v${version.versionNumber}.`);
      setConfirmOpen(false);
      onRestored();
    } catch (error) {
      toast.error(errorMessage(error, "Nao foi possivel restaurar esta versao."));
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
                atual
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {new Date(version.createdAt).toLocaleString("pt-BR")} · {version.createdByName}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowDiff((v) => !v)}>
            {showDiff ? "Ocultar diff" : "Ver diff"}
          </Button>
          {!version.isCurrent && (
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
              Restaurar
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
            <AlertDialogTitle>Restaurar a v{version.versionNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso cria uma nova versao com o grafo desta versao antiga e a torna a atual. O
              historico e preservado — nada e perdido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmRollback}>Restaurar</AlertDialogAction>
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
  const [open, setOpen] = useState(false);
  const { data: versions, isLoading } = useWorkflowVersions(workflowId, open);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <History className="h-3.5 w-3.5" strokeWidth={1.5} />
        Historico
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Historico de versoes</DialogTitle>
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
