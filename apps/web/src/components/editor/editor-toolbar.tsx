"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRunWorkflow } from "@/hooks/use-workflows";
import { ApiError } from "@/lib/api-client";
import { VersionHistoryDialog } from "./version-history-dialog";

export interface EditorToolbarProps {
  workflowId: string;
  name: string;
  saveState: "saved" | "saving" | "dirty";
  onRunStarted: (executionId: string) => void;
  currentVersionId: string | null;
}

const SAVE_LABEL: Record<EditorToolbarProps["saveState"], string> = {
  saved: "Salvo",
  saving: "Salvando...",
  dirty: "Alteracoes nao salvas",
};

export function EditorToolbar({
  workflowId,
  name,
  saveState,
  onRunStarted,
  currentVersionId,
}: EditorToolbarProps) {
  const [runOpen, setRunOpen] = useState(false);
  const [payload, setPayload] = useState("{}");
  const runWorkflow = useRunWorkflow(workflowId);

  async function onRun() {
    let input: Record<string, unknown>;
    try {
      input = payload.trim() ? JSON.parse(payload) : {};
    } catch {
      toast.error("O payload precisa ser um JSON valido.");
      return;
    }

    try {
      const execution = await runWorkflow.mutateAsync(input);
      toast.success("Execucao iniciada.");
      setRunOpen(false);
      onRunStarted(execution.id);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Nao foi possivel executar o fluxo.");
    }
  }

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" render={<Link href="/flows" />}>
          <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
        </Button>
        <span className="text-sm font-medium text-foreground">{name}</span>
        <span className="text-xs text-muted-foreground">{SAVE_LABEL[saveState]}</span>
      </div>

      <div className="flex items-center gap-2">
        {currentVersionId && (
          <VersionHistoryDialog workflowId={workflowId} currentVersionId={currentVersionId} />
        )}
        <Button onClick={() => setRunOpen(true)}>
          <Play className="h-4 w-4" strokeWidth={1.5} />
          Executar
        </Button>
      </div>

      <Dialog open={runOpen} onOpenChange={setRunOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Executar fluxo</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Payload de entrada (JSON) para o trigger manual.
          </p>
          <Textarea
            value={payload}
            onChange={(event) => setPayload(event.target.value)}
            rows={6}
            className="font-mono text-xs"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRunOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={onRun} disabled={runWorkflow.isPending}>
              {runWorkflow.isPending ? "Executando..." : "Executar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
