"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, MoreHorizontal } from "lucide-react";
import { EmptyState } from "@workflow/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
  useDeleteTemplate,
  useTemplates,
  useUpdateTemplate,
  useUseTemplate,
  type Template,
} from "@/hooks/use-templates";
import { errorMessage } from "@/lib/errors";
import { useDictionary, type Dictionary } from "@/lib/i18n";

/**
 * name/description/category dos templates oficiais vem do banco, sempre em
 * pt-BR (sem coluna de traducao) — resolve pela tabela client-side em
 * dictionaries/templates.ts (chave = id do template), com fallback pro dado
 * cru se o id nao tiver entrada (templates de usuario, criados via "Salvar
 * como template").
 */
function getTemplateCopy(template: Template, t: Dictionary) {
  const catalog: Record<string, { name: string; description: string; category: string }> =
    t.templates.catalog;
  return (
    catalog[template.id] ?? {
      name: template.name,
      description: template.description,
      category: template.category,
    }
  );
}

function EditTemplateDialog({
  template,
  onOpenChange,
}: {
  template: Template | null;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useDictionary();
  const [name, setName] = useState(template?.name ?? "");
  const [category, setCategory] = useState(template?.category ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const updateTemplate = useUpdateTemplate();

  async function onSubmit() {
    if (!template || !name.trim() || !category.trim()) return;
    try {
      await updateTemplate.mutateAsync({
        id: template.id,
        name: name.trim(),
        category: category.trim(),
        description: description.trim(),
      });
      toast.success(t.templates.editDialog.saved);
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error, t.templates.editDialog.error));
    }
  }

  return (
    <Dialog
      open={!!template}
      onOpenChange={(v) => {
        if (!v) onOpenChange(false);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.templates.editDialog.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="edit-template-name">{t.templates.editDialog.nameLabel}</Label>
          <Input
            id="edit-template-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-template-category">{t.templates.editDialog.categoryLabel}</Label>
          <Input
            id="edit-template-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-template-description">{t.templates.editDialog.descriptionLabel}</Label>
          <Textarea
            id="edit-template-description"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button
            onClick={onSubmit}
            disabled={updateTemplate.isPending || !name.trim() || !category.trim()}
          >
            {updateTemplate.isPending ? t.common.saving : t.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteTemplateDialog({
  template,
  onOpenChange,
}: {
  template: Template | null;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useDictionary();
  const deleteTemplate = useDeleteTemplate();

  async function onConfirm() {
    if (!template) return;
    try {
      await deleteTemplate.mutateAsync(template.id);
      toast.success(t.templates.deleteDialog.deleted);
    } catch (error) {
      toast.error(errorMessage(error, t.templates.deleteDialog.error));
    } finally {
      onOpenChange(false);
    }
  }

  return (
    <AlertDialog open={!!template} onOpenChange={(v) => !v && onOpenChange(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.templates.deleteDialog.title(template?.name)}</AlertDialogTitle>
          <AlertDialogDescription>{t.templates.deleteDialog.description}</AlertDialogDescription>
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

function TemplateCard({
  template,
  copy,
  onEdit,
  onDelete,
}: {
  template: Template;
  copy: { name: string; description: string; category: string };
  onEdit: (template: Template) => void;
  onDelete: (template: Template) => void;
}) {
  const router = useRouter();
  const useTemplateMutation = useUseTemplate();
  const t = useDictionary();
  const isWorkspaceTemplate = template.workspaceId !== null;

  async function onUse() {
    try {
      const workflow = await useTemplateMutation.mutateAsync(template.id);
      toast.success(t.templates.useSuccessToast(workflow.name));
      router.push(`/flows/${workflow.id}`);
    } catch (error) {
      toast.error(errorMessage(error, t.templates.useErrorFallback));
    }
  }

  return (
    <div className="group flex flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-border-strong">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-xs font-medium uppercase tracking-wide text-primary">
            {copy.category}
          </span>
          <h3 className="mt-1 text-sm font-medium text-foreground">{copy.name}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant={isWorkspaceTemplate ? "secondary" : "outline"}>
            {isWorkspaceTemplate ? t.templates.badgeWorkspace : t.templates.badgeGlobal}
          </Badge>
          {isWorkspaceTemplate && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${t.templates.menu.triggerAria} ${copy.name}`}
                  />
                }
              >
                <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(template)}>
                  {t.templates.menu.edit}
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => onDelete(template)}>
                  {t.common.delete}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{copy.description}</p>

      <div className="flex flex-wrap gap-1">
        {template.graph.nodes.map((node) => (
          <span
            key={node.id}
            className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
          >
            {node.label}
          </span>
        ))}
      </div>

      {/* variant="outline", nao primario: sao varios cards por tela, e o primario
          e reservado a uma acao por vista (style.md 8.2). A seta so anda no
          hover do card — movimento causal, nao decorativo. */}
      <Button
        variant="outline"
        size="sm"
        className="mt-auto"
        onClick={onUse}
        disabled={useTemplateMutation.isPending}
      >
        {useTemplateMutation.isPending ? t.common.creating : t.templates.useButton}
        <ArrowRight
          className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
          strokeWidth={1.5}
        />
      </Button>
    </div>
  );
}

export default function TemplatesPage() {
  const { data: templates, isLoading } = useTemplates();
  const t = useDictionary();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [editTarget, setEditTarget] = useState<Template | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);

  const entries = useMemo(
    () => (templates ?? []).map((template) => ({ template, copy: getTemplateCopy(template, t) })),
    [templates, t],
  );

  const categories = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.copy.category))).sort(),
    [entries],
  );

  const filteredEntries = useMemo(() => {
    const lowerSearch = search.trim().toLowerCase();
    return entries.filter(({ copy }) => {
      if (category && copy.category !== category) return false;
      if (!lowerSearch) return true;
      return (
        copy.name.toLowerCase().includes(lowerSearch) ||
        copy.description.toLowerCase().includes(lowerSearch)
      );
    });
  }, [entries, search, category]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{t.templates.title}</h1>
        <p className="text-sm text-muted-foreground">{t.templates.description}</p>
      </div>

      {!!templates?.length && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={t.templates.categoryFilterAria}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2.5 text-sm text-foreground"
          >
            <option value="">{t.templates.allCategories}</option>
            {categories.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <Input
            placeholder={t.templates.searchPlaceholder}
            className="h-8 w-56"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-40 rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && !templates?.length && (
        <EmptyState
          title={t.templates.emptyTitle}
          description={t.templates.emptyDescription}
        />
      )}

      {!isLoading && !!templates?.length && !filteredEntries.length && (
        <EmptyState
          title={t.templates.filteredEmptyTitle}
          description={t.templates.filteredEmptyDescription}
        />
      )}

      {!!filteredEntries.length && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredEntries.map(({ template, copy }) => (
            <TemplateCard
              key={template.id}
              template={template}
              copy={copy}
              onEdit={setEditTarget}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      <EditTemplateDialog
        key={editTarget?.id ?? "none"}
        template={editTarget}
        onOpenChange={() => setEditTarget(null)}
      />
      <DeleteTemplateDialog template={deleteTarget} onOpenChange={() => setDeleteTarget(null)} />
    </div>
  );
}
