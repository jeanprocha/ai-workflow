"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { EmptyState, StatusBadge, type ExecutionStatus } from "@workflow/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useExecutions, useRetryExecution, type ExecutionFilters } from "@/hooks/use-executions";
import { useWorkflows } from "@/hooks/use-workflows";
import { ApiError } from "@/lib/api-client";

const STATUS_OPTIONS = ["queued", "running", "success", "failed", "canceled"];

function toBadgeStatus(status: string): ExecutionStatus {
  return status === "canceled" ? "failed" : (status as ExecutionStatus);
}

function formatDuration(ms: number | null) {
  if (ms === null) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function formatCost(value: number) {
  return value === 0 ? "—" : `US$ ${value.toFixed(4)}`;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

export default function ExecutionsPage() {
  const [filters, setFilters] = useState<ExecutionFilters>({ page: 1, pageSize: 20 });
  const { data, isLoading } = useExecutions(filters);
  const { data: workflows } = useWorkflows();
  const retryExecution = useRetryExecution();

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1),
    [data],
  );

  function updateFilter(patch: Partial<ExecutionFilters>) {
    setFilters((prev) => ({ ...prev, ...patch, page: patch.page ?? 1 }));
  }

  async function onRetry(id: string) {
    try {
      await retryExecution.mutateAsync(id);
      toast.success("Nova execucao enfileirada.");
    } catch (error) {
      toast.error(errorMessage(error, "Nao foi possivel reexecutar."));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Executions</h1>
        <p className="text-sm text-muted-foreground">Historico de execucoes dos seus fluxos.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filters.workflowId ?? ""}
          onChange={(event) => updateFilter({ workflowId: event.target.value || undefined })}
          className="h-8 rounded-md border border-border bg-background px-2.5 text-sm text-foreground"
        >
          <option value="">Todos os fluxos</option>
          {workflows?.map((workflow) => (
            <option key={workflow.id} value={workflow.id}>
              {workflow.name}
            </option>
          ))}
        </select>

        <select
          value={filters.status ?? ""}
          onChange={(event) => updateFilter({ status: event.target.value || undefined })}
          className="h-8 rounded-md border border-border bg-background px-2.5 text-sm text-foreground"
        >
          <option value="">Todos os status</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>

        <Input
          placeholder="Buscar por nome do fluxo..."
          className="h-8 w-56"
          defaultValue={filters.search ?? ""}
          onChange={(event) => updateFilter({ search: event.target.value || undefined })}
        />
      </div>

      {isLoading && !data && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-12 rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && !data?.items.length && (
        <EmptyState
          title="Nenhuma execucao ainda"
          description="Execute um fluxo para ver o historico aqui."
          action={<Button render={<Link href="/flows" />}>Ir para Flows</Button>}
        />
      )}

      {!!data?.items.length && (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fluxo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead className="text-right">Duracao</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">Iniciado</TableHead>
                <TableHead className="text-right">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((execution) => (
                <TableRow key={execution.id}>
                  <TableCell className="font-medium text-foreground">
                    <Link href={`/executions/${execution.id}`} className="hover:underline">
                      {execution.workflow.name}
                    </Link>
                    {execution.parentExecutionId && (
                      <span className="ml-2 text-xs text-muted-foreground">(replay)</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={toBadgeStatus(execution.status)} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {execution.triggerType}
                  </TableCell>
                  <TableCell className="tabular text-right font-mono text-sm">
                    {formatDuration(execution.durationMs)}
                  </TableCell>
                  <TableCell className="tabular text-right font-mono text-sm">
                    {execution.tokensTotal || "—"}
                  </TableCell>
                  <TableCell className="tabular text-right font-mono text-sm">
                    {formatCost(execution.costUsd)}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {new Date(execution.startedAt).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-right">
                    {execution.status === "failed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={retryExecution.isPending}
                        onClick={() => onRetry(execution.id)}
                      >
                        Reexecutar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {data.total} execucao{data.total === 1 ? "" : "es"} · pagina {data.page} de{" "}
              {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={data.page <= 1}
                onClick={() => updateFilter({ page: data.page - 1 })}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={data.page >= totalPages}
                onClick={() => updateFilter({ page: data.page + 1 })}
              >
                Proxima
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
