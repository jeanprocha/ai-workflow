"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { errorMessage } from "@/lib/errors";
import { useDictionary, useLocale } from "@/lib/i18n";
import { formatDuration, formatUsd } from "@/lib/format";
import { RelativeTime } from "@/components/relative-time";

const STATUS_OPTIONS = ["queued", "running", "success", "failed", "canceled"];

function toBadgeStatus(status: string): ExecutionStatus {
  return status === "canceled" ? "failed" : (status as ExecutionStatus);
}

function ExecutionsPageInner() {
  const t = useDictionary();
  const locale = useLocale();
  // O dashboard linka pra ca com ?status=failed ("o que quebrou hoje").
  // Sem ler a query, aquele link abria a lista inteira sem filtro — uma
  // promessa quebrada.
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("status");
  const [filters, setFilters] = useState<ExecutionFilters>({
    page: 1,
    pageSize: 20,
    status: statusParam && STATUS_OPTIONS.includes(statusParam) ? statusParam : undefined,
  });
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
      toast.success(t.executions.list.retryQueuedToast);
    } catch (error) {
      toast.error(errorMessage(error, t.executions.list.retryErrorFallback));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{t.executions.list.title}</h1>
        <p className="text-sm text-muted-foreground">{t.executions.list.description}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t.executions.list.workflowFilterAria}
          value={filters.workflowId ?? ""}
          onChange={(event) => updateFilter({ workflowId: event.target.value || undefined })}
          className="h-8 rounded-md border border-border bg-background px-2.5 text-sm text-foreground"
        >
          <option value="">{t.executions.list.allFlows}</option>
          {workflows?.map((workflow) => (
            <option key={workflow.id} value={workflow.id}>
              {workflow.name}
            </option>
          ))}
        </select>

        <select
          aria-label={t.executions.list.statusFilterAria}
          value={filters.status ?? ""}
          onChange={(event) => updateFilter({ status: event.target.value || undefined })}
          className="h-8 rounded-md border border-border bg-background px-2.5 text-sm text-foreground"
        >
          <option value="">{t.executions.list.allStatuses}</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>

        <Input
          placeholder={t.executions.list.searchPlaceholder}
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
          title={t.executions.list.emptyTitle}
          description={t.executions.list.emptyDescription}
          action={<Button render={<Link href="/flows" />}>{t.executions.list.goToFlows}</Button>}
        />
      )}

      {!!data?.items.length && (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.executions.list.columnFlow}</TableHead>
                <TableHead>{t.executions.list.columnStatus}</TableHead>
                <TableHead>{t.executions.list.columnTrigger}</TableHead>
                <TableHead className="text-right">{t.executions.list.columnDuration}</TableHead>
                <TableHead className="text-right">{t.executions.list.columnTokens}</TableHead>
                <TableHead className="text-right">{t.executions.list.columnCost}</TableHead>
                <TableHead className="text-right">{t.executions.list.columnStarted}</TableHead>
                <TableHead className="text-right">{t.executions.list.columnActions}</TableHead>
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
                      <span className="ml-2 text-xs text-muted-foreground">
                        {t.executions.list.replayTag}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={toBadgeStatus(execution.status)} labels={t.common.executionStatus} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {execution.triggerType}
                  </TableCell>
                  <TableCell className="tabular text-right font-mono text-sm">
                    {execution.durationMs === null
                      ? "—"
                      : formatDuration(execution.durationMs, locale)}
                  </TableCell>
                  <TableCell className="tabular text-right font-mono text-sm">
                    {execution.tokensTotal || "—"}
                  </TableCell>
                  <TableCell className="tabular text-right font-mono text-sm">
                    {execution.costUsd === 0 ? "—" : formatUsd(execution.costUsd, locale, 4)}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    <RelativeTime value={execution.startedAt} />
                  </TableCell>
                  <TableCell className="text-right">
                    {execution.status === "failed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={retryExecution.isPending}
                        onClick={() => onRetry(execution.id)}
                      >
                        {t.executions.list.retry}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {t.executions.list.paginationSummary(data.total, data.page, totalPages)}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={data.page <= 1}
                onClick={() => updateFilter({ page: data.page - 1 })}
              >
                {t.executions.list.previous}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={data.page >= totalPages}
                onClick={() => updateFilter({ page: data.page + 1 })}
              >
                {t.executions.list.next}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * useSearchParams exige um limite de Suspense no App Router — sem ele o
 * build falha ao pre-renderizar esta rota.
 */
export default function ExecutionsPage() {
  return (
    <Suspense fallback={null}>
      <ExecutionsPageInner />
    </Suspense>
  );
}
