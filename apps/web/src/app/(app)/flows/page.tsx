"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { MoreHorizontal, Plus } from "lucide-react";
import type { Workflow } from "@workflow/shared";
import { EmptyState } from "@workflow/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { ApiError } from "@/lib/api-client";

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
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Criar fluxo
          </Button>
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
          description="Crie seu primeiro fluxo ou comece por um template."
          action={<Button onClick={() => setCreateOpen(true)}>Criar fluxo</Button>}
          secondaryAction={
            <Button variant="outline" render={<Link href="/templates" />}>
              Ver templates
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
      <RenameFlowDialog
        key={renameTarget?.id ?? "none"}
        workflow={renameTarget}
        onOpenChange={() => setRenameTarget(null)}
      />
      <DeleteFlowDialog workflow={deleteTarget} onOpenChange={() => setDeleteTarget(null)} />
    </div>
  );
}
