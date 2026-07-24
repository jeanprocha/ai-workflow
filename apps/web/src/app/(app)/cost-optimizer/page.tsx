"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { PiggyBank, RefreshCw } from "lucide-react";
import { EmptyState } from "@workflow/ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useApplyCostSuggestion,
  useCostOptimizerSuggestions,
} from "@/hooks/use-cost-optimizer";
import { ApiError } from "@/lib/api-client";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

export default function CostOptimizerPage() {
  const [analyzed, setAnalyzed] = useState(false);
  const { data: suggestions, isLoading, refetch, isFetching } = useCostOptimizerSuggestions(analyzed);
  const applySuggestion = useApplyCostSuggestion();
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());

  async function onAnalyze() {
    setAnalyzed(true);
    await refetch();
  }

  async function onApply(suggestionId: string) {
    try {
      await applySuggestion.mutateAsync(suggestionId);
      setAppliedIds((prev) => new Set(prev).add(suggestionId));
      toast.success("Modelo trocado — uma nova versao do fluxo foi salva.");
    } catch (error) {
      toast.error(errorMessage(error, "Nao foi possivel aplicar esta sugestao."));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Cost Optimizer</h1>
          <p className="text-sm text-muted-foreground">
            Analisa o historico real de execucoes (ultimos 30 dias) e sugere trocar por um modelo
            mais barato quando isso nao compromete a tarefa.
          </p>
        </div>
        <Button onClick={onAnalyze} disabled={isFetching}>
          <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
          {isFetching ? "Analisando..." : "Analisar"}
        </Button>
      </div>

      {!analyzed && (
        <EmptyState
          title="Ainda nao analisado"
          description="Clique em Analisar para ver oportunidades reais de economia com base no que os seus fluxos ja rodaram."
          action={<Button onClick={onAnalyze}>Analisar</Button>}
        />
      )}

      {analyzed && isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-20 rounded-lg" />
          ))}
        </div>
      )}

      {analyzed && !isLoading && !suggestions?.length && (
        <EmptyState
          title="Nenhuma oportunidade encontrada"
          description="Ou os fluxos ja usam modelos economicos, ou ainda nao ha volume suficiente de execucoes (minimo 3 por node) nos ultimos 30 dias."
        />
      )}

      {!!suggestions?.length && (
        <div className="space-y-3">
          {suggestions.map((suggestion) => {
            const applied = appliedIds.has(suggestion.suggestionId);
            return (
              <div
                key={suggestion.suggestionId}
                className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success-subtle text-success">
                    <PiggyBank className="h-4 w-4" strokeWidth={1.5} />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      <Link href={`/flows/${suggestion.workflowId}`} className="hover:underline">
                        {suggestion.workflowName}
                      </Link>
                      <span className="text-muted-foreground"> · node {suggestion.nodeId}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Trocar <span className="font-mono">{suggestion.currentProvider}/{suggestion.currentModel}</span>{" "}
                      por{" "}
                      <span className="font-mono text-foreground">
                        {suggestion.suggestedProvider}/{suggestion.suggestedModel}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Baseado em {suggestion.sampleSize} execucoes · custo medio atual US${" "}
                      {suggestion.avgCostUsd.toFixed(4)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-lg font-semibold text-success">
                    -{suggestion.estimatedSavingsPercent}%
                  </span>
                  <Button
                    size="sm"
                    variant={applied ? "secondary" : "outline"}
                    disabled={applied || applySuggestion.isPending}
                    onClick={() => onApply(suggestion.suggestionId)}
                  >
                    {applied ? "Aplicado" : "Aplicar"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
