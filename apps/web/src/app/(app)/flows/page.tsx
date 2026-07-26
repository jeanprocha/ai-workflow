"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, Plus, Sparkles } from "lucide-react";
import type { Workflow, WorkflowGraph } from "@workflow/shared";
import { EmptyState } from "@workflow/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProviderModelFields, type ProviderModelValue } from "@/components/ai/provider-model-fields";
import { useGenerateWorkflow } from "@/hooks/use-autocomplete";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useCreateWorkflow,
  useDeleteWorkflow,
  useUpdateWorkflow,
  useWorkflows,
} from "@/hooks/use-workflows";
import { apiFetch } from "@/lib/api-client";
import { errorMessage } from "@/lib/errors";
import { useDictionary, useLocale } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-success-subtle text-success",
  archived: "bg-muted text-text-muted",
};

function CreateFlowDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useDictionary();
  const [name, setName] = useState("");
  const createWorkflow = useCreateWorkflow();

  async function onSubmit() {
    if (!name.trim()) return;
    try {
      await createWorkflow.mutateAsync({ name: name.trim() });
      toast.success(t.flows.toasts.created);
      setName("");
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error, t.flows.toasts.createError));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.flows.createFlow}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="flow-name">{t.flows.nameLabel}</Label>
          <Input
            id="flow-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t.flows.createDialog.namePlaceholder}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createWorkflow.isPending}
          >
            {t.common.cancel}
          </Button>
          <Button onClick={onSubmit} disabled={createWorkflow.isPending || !name.trim()}>
            {createWorkflow.isPending ? t.common.creating : t.flows.createFlow}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GenerateWithAiDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useDictionary();
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [aiConfig, setAiConfig] = useState<ProviderModelValue>({
    provider: "anthropic",
    model: "claude-sonnet-5",
    credential: "",
  });
  const [preview, setPreview] = useState<WorkflowGraph | null>(null);
  const [creating, setCreating] = useState(false);
  const generateWorkflow = useGenerateWorkflow();
  const createWorkflow = useCreateWorkflow();

  function reset() {
    setPrompt("");
    setPreview(null);
  }

  async function onGenerate() {
    if (!prompt.trim() || !aiConfig.model.trim()) return;
    try {
      const result = await generateWorkflow.mutateAsync({
        prompt: prompt.trim(),
        provider: aiConfig.provider,
        model: aiConfig.model.trim(),
        credential: aiConfig.credential.trim(),
      });
      setPreview(result.graph);
    } catch (error) {
      toast.error(errorMessage(error, t.flows.toasts.generateError));
    }
  }

  async function onAccept() {
    if (!preview) return;
    setCreating(true);
    try {
      const workflow = await createWorkflow.mutateAsync({
        name: prompt.trim().slice(0, 60) || t.flows.generateDialog.defaultName,
      });
      await apiFetch(`/workflows/${workflow.id}/graph`, {
        method: "PUT",
        body: { graph: preview },
      });
      toast.success(t.flows.toasts.generatedSaved);
      onOpenChange(false);
      reset();
      router.push(`/flows/${workflow.id}`);
    } catch (error) {
      toast.error(errorMessage(error, t.flows.toasts.generateSaveError));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" strokeWidth={1.5} />
              {t.flows.generateDialog.title}
            </span>
          </DialogTitle>
        </DialogHeader>

        {!preview ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="ai-prompt">{t.flows.generateDialog.promptLabel}</Label>
              <Textarea
                id="ai-prompt"
                rows={4}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={t.flows.generateDialog.promptPlaceholder}
                autoFocus
              />
            </div>
            <ProviderModelFields idPrefix="ai-generate" value={aiConfig} onChange={setAiConfig} />
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t.common.cancel}
              </Button>
              <Button
                onClick={onGenerate}
                disabled={generateWorkflow.isPending || !prompt.trim() || !aiConfig.model.trim()}
              >
                {generateWorkflow.isPending ? t.flows.generateDialog.generating : t.flows.generateDialog.generate}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {t.flows.generateDialog.previewSummary(preview.nodes.length, preview.edges.length)}
            </p>
            <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-lg border border-border bg-muted p-2">
              {preview.nodes.map((node) => (
                <div
                  key={node.id}
                  className="flex items-center justify-between rounded-md bg-card px-2.5 py-1.5 text-xs"
                >
                  <span className="font-medium text-foreground">{node.label}</span>
                  <span className="font-mono text-muted-foreground">{node.type}</span>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreview(null)}>
                {t.flows.generateDialog.regenerate}
              </Button>
              <Button onClick={onAccept} disabled={creating}>
                {creating ? t.common.saving : t.flows.generateDialog.accept}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RenameFlowDialog({
  workflow,
  onOpenChange,
}: {
  workflow: Workflow | null;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useDictionary();
  const [name, setName] = useState(workflow?.name ?? "");
  const updateWorkflow = useUpdateWorkflow();

  async function onSubmit() {
    if (!workflow || !name.trim()) return;
    try {
      await updateWorkflow.mutateAsync({ id: workflow.id, name: name.trim() });
      toast.success(t.flows.toasts.renamed);
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error, t.flows.toasts.renameError));
    }
  }

  return (
    <Dialog
      open={!!workflow}
      onOpenChange={(v) => {
        if (!v) onOpenChange(false);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.flows.renameDialog.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="rename-flow">{t.flows.nameLabel}</Label>
          <Input
            id="rename-flow"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button onClick={onSubmit} disabled={updateWorkflow.isPending}>
            {updateWorkflow.isPending ? t.common.saving : t.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteFlowDialog({
  workflow,
  onOpenChange,
}: {
  workflow: Workflow | null;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useDictionary();
  const deleteWorkflow = useDeleteWorkflow();

  async function onConfirm() {
    if (!workflow) return;
    try {
      await deleteWorkflow.mutateAsync(workflow.id);
      toast.success(t.flows.toasts.deleted);
    } catch (error) {
      toast.error(errorMessage(error, t.flows.toasts.deleteError));
    } finally {
      // O open e controlado por deleteTarget no pai — sem este reset o
      // dialog ficava preso aberto (com o nome do fluxo ja excluido) apos
      // confirmar. Mesmo padrao do delete em Settings. Pego pela suite E2E.
      onOpenChange(false);
    }
  }

  return (
    <AlertDialog open={!!workflow} onOpenChange={(v) => !v && onOpenChange(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.flows.deleteDialog.title(workflow?.name)}</AlertDialogTitle>
          <AlertDialogDescription>{t.flows.deleteDialog.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-danger/10 text-danger hover:bg-danger/20"
            onClick={onConfirm}
          >
            {t.common.delete}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function FlowsPage() {
  const t = useDictionary();
  const locale = useLocale();
  const { data: workflows, isLoading } = useWorkflows();
  const updateWorkflow = useUpdateWorkflow();
  const [createOpen, setCreateOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Workflow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Workflow | null>(null);

  async function toggleStatus(workflow: Workflow) {
    const nextStatus = workflow.status === "active" ? "archived" : "active";
    try {
      await updateWorkflow.mutateAsync({ id: workflow.id, status: nextStatus });
      toast.success(nextStatus === "active" ? t.flows.toasts.activated : t.flows.toasts.archived);
    } catch (error) {
      toast.error(errorMessage(error, t.flows.toasts.statusError));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{t.flows.title}</h1>
          <p className="text-sm text-muted-foreground">{t.flows.description}</p>
        </div>
        {!!workflows?.length && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setGenerateOpen(true)}>
              <Sparkles className="h-4 w-4" strokeWidth={1.5} />
              {t.flows.generateWithAi}
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              {t.flows.createFlow}
            </Button>
          </div>
        )}
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && !workflows?.length && (
        <EmptyState
          title={t.flows.emptyState.title}
          description={t.flows.emptyState.description}
          action={
            <Button onClick={() => setGenerateOpen(true)}>
              <Sparkles className="h-4 w-4" strokeWidth={1.5} />
              {t.flows.generateWithAi}
            </Button>
          }
          secondaryAction={
            <Button variant="outline" onClick={() => setCreateOpen(true)}>
              {t.flows.createFlow}
            </Button>
          }
        />
      )}

      {!!workflows?.length && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workflows.map((workflow) => (
            <Link
              key={workflow.id}
              href={`/flows/${workflow.id}`}
              className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-border-strong"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-medium text-foreground">{workflow.name}</h3>
                <div onClick={(event) => event.preventDefault()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${t.flows.menu.triggerAria} ${workflow.name}`}
                        />
                      }
                    >
                      <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setRenameTarget(workflow)}>
                        {t.flows.menu.rename}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toggleStatus(workflow)}>
                        {workflow.status === "active" ? t.flows.menu.archive : t.flows.menu.activate}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setDeleteTarget(workflow)}
                      >
                        {t.common.delete}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <span
                className={
                  "w-fit rounded-full px-2 py-0.5 text-xs font-medium " +
                  STATUS_STYLE[workflow.status]
                }
              >
                {t.flows.statusLabel[workflow.status]}
              </span>
              <p className="mt-auto text-xs text-muted-foreground">
                {t.flows.updatedAt(formatDateTime(workflow.updatedAt, locale, { dateStyle: "short" }))}
              </p>
            </Link>
          ))}
        </div>
      )}

      <CreateFlowDialog open={createOpen} onOpenChange={setCreateOpen} />
      <GenerateWithAiDialog open={generateOpen} onOpenChange={setGenerateOpen} />
      <RenameFlowDialog
        key={renameTarget?.id ?? "none"}
        workflow={renameTarget}
        onOpenChange={() => setRenameTarget(null)}
      />
      <DeleteFlowDialog workflow={deleteTarget} onOpenChange={() => setDeleteTarget(null)} />
    </div>
  );
}
