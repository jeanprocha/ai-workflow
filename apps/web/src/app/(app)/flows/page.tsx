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
import { apiFetch, ApiError } from "@/lib/api-client";

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  active: "Ativo",
  archived: "Arquivado",
};

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-success-subtle text-success",
  archived: "bg-muted text-text-muted",
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function CreateFlowDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [name, setName] = useState("");
  const createWorkflow = useCreateWorkflow();

  async function onSubmit() {
    if (!name.trim()) return;
    try {
      await createWorkflow.mutateAsync({ name: name.trim() });
      toast.success("Fluxo criado.");
      setName("");
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error, "Nao foi possivel criar o fluxo."));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar fluxo</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="flow-name">Nome</Label>
          <Input
            id="flow-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex: Suporte IA"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createWorkflow.isPending}
          >
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={createWorkflow.isPending || !name.trim()}>
            {createWorkflow.isPending ? "Criando..." : "Criar fluxo"}
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
      toast.error(errorMessage(error, "Nao foi possivel gerar o fluxo."));
    }
  }

  async function onAccept() {
    if (!preview) return;
    setCreating(true);
    try {
      const workflow = await createWorkflow.mutateAsync({
        name: prompt.trim().slice(0, 60) || "Fluxo gerado por IA",
      });
      await apiFetch(`/workflows/${workflow.id}/graph`, {
        method: "PUT",
        body: { graph: preview },
      });
      toast.success("Fluxo gerado e salvo.");
      onOpenChange(false);
      reset();
      router.push(`/flows/${workflow.id}`);
    } catch (error) {
      toast.error(errorMessage(error, "Nao foi possivel salvar o fluxo gerado."));
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
              Gerar fluxo com IA
            </span>
          </DialogTitle>
        </DialogHeader>

        {!preview ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="ai-prompt">Descreva o que o fluxo deve fazer</Label>
              <Textarea
                id="ai-prompt"
                rows={4}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Ex: Quando chegar um email com boleto, extraia os dados, grave no banco, responda confirmando e envie no Slack."
                autoFocus
              />
            </div>
            <ProviderModelFields idPrefix="ai-generate" value={aiConfig} onChange={setAiConfig} />
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={onGenerate}
                disabled={generateWorkflow.isPending || !prompt.trim() || !aiConfig.model.trim()}
              >
                {generateWorkflow.isPending ? "Gerando..." : "Gerar"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {preview.nodes.length} node(s), {preview.edges.length} conexao(oes). Revise antes de
              salvar — voce podera editar tudo no canvas depois.
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
                Gerar de novo
              </Button>
              <Button onClick={onAccept} disabled={creating}>
                {creating ? "Salvando..." : "Aceitar e criar fluxo"}
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
  const [name, setName] = useState(workflow?.name ?? "");
  const updateWorkflow = useUpdateWorkflow();

  async function onSubmit() {
    if (!workflow || !name.trim()) return;
    try {
      await updateWorkflow.mutateAsync({ id: workflow.id, name: name.trim() });
      toast.success("Fluxo renomeado.");
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error, "Nao foi possivel renomear o fluxo."));
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
          <DialogTitle>Renomear fluxo</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="rename-flow">Nome</Label>
          <Input
            id="rename-flow"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={updateWorkflow.isPending}>
            {updateWorkflow.isPending ? "Salvando..." : "Salvar"}
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
  const deleteWorkflow = useDeleteWorkflow();

  async function onConfirm() {
    if (!workflow) return;
    try {
      await deleteWorkflow.mutateAsync(workflow.id);
      toast.success("Fluxo excluido.");
    } catch (error) {
      toast.error(errorMessage(error, "Nao foi possivel excluir o fluxo."));
    }
  }

  return (
    <AlertDialog open={!!workflow} onOpenChange={(v) => !v && onOpenChange(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir o fluxo &ldquo;{workflow?.name}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            Todas as versoes e o historico de execucoes deste fluxo serao perdidos. Esta acao nao
            pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-danger/10 text-danger hover:bg-danger/20"
            onClick={onConfirm}
          >
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function FlowsPage() {
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
      toast.success(nextStatus === "active" ? "Fluxo ativado." : "Fluxo arquivado.");
    } catch (error) {
      toast.error(errorMessage(error, "Nao foi possivel atualizar o status."));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Flows</h1>
          <p className="text-sm text-muted-foreground">
            Automacoes visuais construidas com nodes independentes.
          </p>
        </div>
        {!!workflows?.length && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setGenerateOpen(true)}>
              <Sparkles className="h-4 w-4" strokeWidth={1.5} />
              Gerar com IA
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Criar fluxo
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
          title="Nenhum fluxo ainda"
          description="Descreva o que voce precisa e a IA monta o fluxo, ou comece do zero / por um template."
          action={
            <Button onClick={() => setGenerateOpen(true)}>
              <Sparkles className="h-4 w-4" strokeWidth={1.5} />
              Gerar com IA
            </Button>
          }
          secondaryAction={
            <Button variant="outline" onClick={() => setCreateOpen(true)}>
              Criar fluxo
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
                      render={<Button variant="ghost" size="icon-sm" />}
                    >
                      <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setRenameTarget(workflow)}>
                        Renomear
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toggleStatus(workflow)}>
                        {workflow.status === "active" ? "Arquivar" : "Ativar"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setDeleteTarget(workflow)}
                      >
                        Excluir
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
                {STATUS_LABEL[workflow.status]}
              </span>
              <p className="mt-auto text-xs text-muted-foreground">
                Atualizado {new Date(workflow.updatedAt).toLocaleDateString("pt-BR")}
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
