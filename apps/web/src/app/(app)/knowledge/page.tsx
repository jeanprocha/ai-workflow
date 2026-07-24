"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Database, Trash2 } from "lucide-react";
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
  useCreateKnowledgeBase,
  useDeleteKnowledgeBase,
  useKnowledgeBases,
  type CreateKnowledgeBaseInput,
  type KnowledgeBase,
} from "@/hooks/use-knowledge";
import { ApiError } from "@/lib/api-client";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function CreateKnowledgeBaseDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [form, setForm] = useState<CreateKnowledgeBaseInput>({
    name: "",
    description: "",
    credential: "",
  });
  const createKb = useCreateKnowledgeBase();

  async function onSubmit() {
    if (!form.name.trim()) return;
    try {
      await createKb.mutateAsync(form);
      toast.success("Base de conhecimento criada.");
      setForm({ name: "", description: "", credential: "" });
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error, "Nao foi possivel criar a base."));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar base de conhecimento</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="kb-name">Nome</Label>
            <Input
              id="kb-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Ex: Manual do Produto"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kb-description">Descricao</Label>
            <Textarea
              id="kb-description"
              rows={2}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kb-credential">Credencial OpenAI (embeddings)</Label>
            <Input
              id="kb-credential"
              value={form.credential}
              onChange={(event) => setForm({ ...form, credential: event.target.value })}
              placeholder="Ex: openai-default"
            />
            <p className="text-xs text-muted-foreground">
              Os embeddings usam OpenAI (text-embedding-3-small). Claude/Anthropic nao tem API
              de embeddings.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={createKb.isPending || !form.name.trim()}>
            {createKb.isPending ? "Criando..." : "Criar base"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function KnowledgePage() {
  const { data: bases, isLoading } = useKnowledgeBases();
  const deleteKb = useDeleteKnowledgeBase();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeBase | null>(null);

  async function onConfirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteKb.mutateAsync(deleteTarget.id);
      toast.success("Base de conhecimento excluida.");
    } catch (error) {
      toast.error(errorMessage(error, "Nao foi possivel excluir a base."));
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Knowledge</h1>
          <p className="text-sm text-muted-foreground">
            Base de conhecimento para seus agentes consultarem.
          </p>
        </div>
        {!!bases?.length && <Button onClick={() => setCreateOpen(true)}>Criar base</Button>}
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && !bases?.length && (
        <EmptyState
          title="Nenhuma base de conhecimento ainda"
          description="Crie uma base e envie PDF, DOCX, Markdown, TXT ou CSV para comecar."
          action={<Button onClick={() => setCreateOpen(true)}>Criar base</Button>}
        />
      )}

      {!!bases?.length && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bases.map((kb) => (
            <div
              key={kb.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                  <h3 className="text-sm font-medium text-foreground">{kb.name}</h3>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(kb)}>
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                </Button>
              </div>
              {kb.description && (
                <p className="text-xs text-muted-foreground">{kb.description}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {kb._count.documents} documento{kb._count.documents === 1 ? "" : "s"}
              </p>
              <Button variant="outline" size="sm" className="mt-auto" render={<Link href={`/knowledge/${kb.id}`} />}>
                Ver documentos
              </Button>
            </div>
          ))}
        </div>
      )}

      <CreateKnowledgeBaseDialog open={createOpen} onOpenChange={setCreateOpen} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a base &ldquo;{deleteTarget?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os documentos e chunks desta base serao excluidos. Agentes que usam esta
              base deixarao de ter acesso a ela. Esta acao nao pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger/10 text-danger hover:bg-danger/20"
              onClick={onConfirmDelete}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
