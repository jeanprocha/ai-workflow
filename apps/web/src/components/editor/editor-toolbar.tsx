"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Play, Save } from "lucide-react";
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
import { useDictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { VersionHistoryDialog } from "./version-history-dialog";
import { CopilotDialog } from "./copilot-dialog";

export interface EditorToolbarProps {
  workflowId: string;
  name: string;
  saveState: "saved" | "saving" | "dirty";
  onSave: () => void;
  onRunStarted: (executionId: string) => void;
  currentVersionId: string | null;
}

export function EditorToolbar({
  workflowId,
  name,
  saveState,
  onSave,
  onRunStarted,
  currentVersionId,
}: EditorToolbarProps) {
  const dictionary = useDictionary();
  const t = dictionary.editor.toolbar;
  const [runOpen, setRunOpen] = useState(false);
  const [payload, setPayload] = useState("{}");
  const runWorkflow = useRunWorkflow(workflowId);

  const saveLabel: Record<EditorToolbarProps["saveState"], string> = {
    saved: t.saveLabel.saved,
    saving: t.saveLabel.saving,
    dirty: t.saveLabel.dirty,
  };

  async function onRun() {
    let input: Record<string, unknown>;
    try {
      input = payload.trim() ? JSON.parse(payload) : {};
    } catch {
      toast.error(t.invalidPayloadToast);
      return;
    }

    try {
      const execution = await runWorkflow.mutateAsync(input);
      toast.success(t.runStartedToast);
      setRunOpen(false);
      onRunStarted(execution.id);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t.runErrorFallback);
    }
  }

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
      <div className="flex min-w-0 items-center gap-2 md:gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t.backAria}
          render={<Link href="/flows" />}
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
        </Button>
        <span className="truncate text-sm font-medium text-foreground">{name}</span>
        <span
          role={saveState === "dirty" ? "status" : undefined}
          className={cn(
            "hidden shrink-0 text-xs sm:inline",
            saveState === "dirty" ? "font-medium text-warning" : "text-muted-foreground",
          )}
        >
          {saveLabel[saveState]}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant={saveState === "dirty" ? "default" : "outline"}
          onClick={onSave}
          disabled={saveState !== "dirty"}
          title={t.saveAria}
        >
          <Save className="h-4 w-4" strokeWidth={1.5} />
          {t.save}
        </Button>
        <CopilotDialog workflowId={workflowId} />
        {currentVersionId && (
          <VersionHistoryDialog workflowId={workflowId} currentVersionId={currentVersionId} />
        )}
        <Button onClick={() => setRunOpen(true)}>
          <Play className="h-4 w-4" strokeWidth={1.5} />
          {t.run}
        </Button>
      </div>

      <Dialog open={runOpen} onOpenChange={setRunOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.runDialogTitle}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t.payloadDescription}
          </p>
          <Textarea
            value={payload}
            onChange={(event) => setPayload(event.target.value)}
            rows={6}
            className="font-mono text-xs"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRunOpen(false)}>
              {useDictionary().common.cancel}
            </Button>
            <Button onClick={onRun} disabled={runWorkflow.isPending}>
              {runWorkflow.isPending ? t.running : t.run}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
