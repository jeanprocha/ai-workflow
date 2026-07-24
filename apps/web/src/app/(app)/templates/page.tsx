"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { EmptyState } from "@workflow/ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTemplates, useUseTemplate, type Template } from "@/hooks/use-templates";
import { ApiError } from "@/lib/api-client";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function TemplateCard({ template }: { template: Template }) {
  const router = useRouter();
  const useTemplateMutation = useUseTemplate();

  async function onUse() {
    try {
      const workflow = await useTemplateMutation.mutateAsync(template.id);
      toast.success(`Fluxo "${workflow.name}" criado a partir do template.`);
      router.push(`/flows/${workflow.id}`);
    } catch (error) {
      toast.error(errorMessage(error, "Nao foi possivel usar este template."));
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div>
        <span className="text-xs font-medium uppercase tracking-wide text-primary">
          {template.category}
        </span>
        <h3 className="mt-1 text-sm font-medium text-foreground">{template.name}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>
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

      <Button
        size="sm"
        className="mt-auto"
        onClick={onUse}
        disabled={useTemplateMutation.isPending}
      >
        {useTemplateMutation.isPending ? "Criando..." : "Usar template"}
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
      </Button>
    </div>
  );
}

export default function TemplatesPage() {
  const { data: templates, isLoading } = useTemplates();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Templates</h1>
        <p className="text-sm text-muted-foreground">
          Fluxos prontos para usar como ponto de partida.
        </p>
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
          title="Nenhum template disponivel"
          description="Os templates oficiais aparecerao aqui assim que forem publicados."
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
