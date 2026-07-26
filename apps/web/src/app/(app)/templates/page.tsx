"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { EmptyState } from "@workflow/ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTemplates, useUseTemplate, type Template } from "@/hooks/use-templates";
import { errorMessage } from "@/lib/errors";
import { useDictionary, type Dictionary } from "@/lib/i18n";

/**
 * name/description/category dos templates oficiais vem do banco, sempre em
 * pt-BR (sem coluna de traducao) — resolve pela tabela client-side em
 * dictionaries/templates.ts (chave = id do template), com fallback pro dado
 * cru se o id nao tiver entrada (templates novos criados fora do seed).
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

function TemplateCard({ template }: { template: Template }) {
  const router = useRouter();
  const useTemplateMutation = useUseTemplate();
  const t = useDictionary();
  const copy = getTemplateCopy(template, t);

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
      <div>
        <span className="text-xs font-medium uppercase tracking-wide text-primary">
          {copy.category}
        </span>
        <h3 className="mt-1 text-sm font-medium text-foreground">{copy.name}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{copy.description}</p>
      </div>

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

      {/* variant="outline", nao primario: sao 7 cards por tela, e o primario
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{t.templates.title}</h1>
        <p className="text-sm text-muted-foreground">{t.templates.description}</p>
      </div>

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

      {!!templates?.length && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))}
        </div>
      )}
    </div>
  );
}
