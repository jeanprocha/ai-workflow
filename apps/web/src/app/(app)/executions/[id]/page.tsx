"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, RotateCw, Stethoscope } from "lucide-react";
import { StatusBadge, type ExecutionStatus } from "@workflow/ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { JsonViewer } from "@/components/json-viewer";
import { ProviderModelFields, type ProviderModelValue } from "@/components/ai/provider-model-fields";
import {
  useExecution,
  useReplayExecution,
  useRetryExecution,
  type ExecutionStep,
} from "@/hooks/use-executions";
import { useExecutionLive } from "@/hooks/use-execution-live";
import {
  useApplyDiagnosisSuggestion,
  useDiagnoseExecution,
  type DiagnosisResult,
} from "@/hooks/use-debugger";
import { errorMessage } from "@/lib/errors";
import { useDictionary, useLocale, type Dictionary } from "@/lib/i18n";
import { formatDuration, formatMegabytes, formatUsd } from "@/lib/format";

function suggestionLabel(t: Dictionary, tipo: string): string | undefined {
  const map: Record<string, string> = {
    retry: t.executions.detail.suggestionRetry,
    timeout: t.executions.detail.suggestionTimeout,
    fallback: t.executions.detail.suggestionFallback,
  };
  return map[tipo];
}

function toBadgeStatus(status: string): ExecutionStatus {
  return status === "canceled" ? "failed" : (status as ExecutionStatus);
}

function DebuggerDialog({
  executionId,
  open,
  onOpenChange,
}: {
  executionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useDictionary();
  const [aiConfig, setAiConfig] = useState<ProviderModelValue>({
    provider: "anthropic",
    model: "claude-sonnet-5",
    credential: "",
  });
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [appliedIndex, setAppliedIndex] = useState<number | null>(null);
  const diagnose = useDiagnoseExecution(executionId);
  const applySuggestion = useApplyDiagnosisSuggestion();

  function reset() {
    setDiagnosis(null);
    setAppliedIndex(null);
  }

  async function onDiagnose() {
    try {
      const result = await diagnose.mutateAsync({
        provider: aiConfig.provider,
        model: aiConfig.model.trim(),
        credential: aiConfig.credential.trim(),
      });
      setDiagnosis(result);
    } catch (error) {
      toast.error(errorMessage(error, t.executions.detail.diagnoseErrorFallback));
    }
  }

  async function onApply(index: number) {
    if (!diagnosis) return;
    try {
      await applySuggestion.mutateAsync({
        suggestionId: diagnosis.suggestionId,
        suggestionIndex: index,
      });
      setAppliedIndex(index);
      toast.success(t.executions.detail.applyFixToast);
    } catch (error) {
      toast.error(errorMessage(error, t.executions.detail.applyFixErrorFallback));
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
              <Stethoscope className="h-4 w-4 text-primary" strokeWidth={1.5} />
              {t.executions.detail.debuggerTitle}
            </span>
          </DialogTitle>
        </DialogHeader>

        {!diagnosis ? (
          <>
            <p className="text-xs text-muted-foreground">
              {t.executions.detail.debuggerDescription}
            </p>
            <ProviderModelFields idPrefix="debugger" value={aiConfig} onChange={setAiConfig} />
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t.common.cancel}
              </Button>
              <Button onClick={onDiagnose} disabled={diagnose.isPending || !aiConfig.model.trim()}>
                {diagnose.isPending ? t.executions.detail.diagnosing : t.executions.detail.diagnose}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-border bg-muted p-3">
              <p className="text-xs font-medium text-muted-foreground">
                {t.executions.detail.possibleCause}
              </p>
              <p className="mt-1 text-sm text-foreground">{diagnosis.causaProvavel}</p>
            </div>
            <div className="space-y-2">
              {diagnosis.sugestoes.map((suggestion, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {suggestionLabel(t, suggestion.tipo) ?? suggestion.tipo}
                    </p>
                    <p className="text-xs text-muted-foreground">{suggestion.descricao}</p>
                  </div>
                  {suggestion.aplicavel ? (
                    <Button
                      size="sm"
                      variant={appliedIndex === index ? "secondary" : "outline"}
                      onClick={() => onApply(index)}
                      disabled={applySuggestion.isPending || appliedIndex === index}
                    >
                      {appliedIndex === index ? t.common.applied : t.common.apply}
                    </Button>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {t.executions.detail.manual}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t.common.close}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReplayFromNodeDialog({
  executionId,
  step,
  onOpenChange,
}: {
  executionId: string;
  step: ExecutionStep | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useDictionary();
  const router = useRouter();
  const replay = useReplayExecution();
  const [inputText, setInputText] = useState("");

  if (step && inputText === "" && step.input !== null) {
    setInputText(JSON.stringify(step.input, null, 2));
  }

  async function onSubmit() {
    if (!step) return;
    let parsed: unknown;
    try {
      parsed = inputText.trim() ? JSON.parse(inputText) : undefined;
    } catch {
      toast.error(t.executions.detail.replayInvalidJsonToast);
      return;
    }
    try {
      const result = await replay.mutateAsync({
        id: executionId,
        fromNodeId: step.nodeId,
        input: parsed,
      });
      toast.success(t.executions.detail.replayQueuedToast);
      onOpenChange(false);
      setInputText("");
      router.push(`/executions/${result.id}`);
    } catch (error) {
      toast.error(errorMessage(error, t.executions.detail.replayErrorFallback));
    }
  }

  return (
    <Dialog
      open={!!step}
      onOpenChange={(open) => {
        if (!open) setInputText("");
        onOpenChange(open);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {step ? t.executions.detail.replayDialogTitle(step.nodeId) : null}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {t.executions.detail.replayDialogDescription}
        </p>
        <Textarea
          rows={10}
          className="font-mono text-xs"
          value={inputText}
          onChange={(event) => setInputText(event.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button onClick={onSubmit} disabled={replay.isPending}>
            {replay.isPending ? t.executions.detail.replaySending : t.executions.detail.replaySubmit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ExecutionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useDictionary();
  const locale = useLocale();
  const router = useRouter();
  const { data: execution, isLoading } = useExecution(id);
  const retryExecution = useRetryExecution();
  const [replayStep, setReplayStep] = useState<ExecutionStep | null>(null);
  const [debuggerOpen, setDebuggerOpen] = useState(false);

  const isLive = execution?.status === "running" || execution?.status === "queued";
  const { logs: liveLogs } = useExecutionLive(id, isLive);

  async function onRetry() {
    try {
      const result = await retryExecution.mutateAsync(id);
      toast.success(t.executions.detail.retryQueuedToast);
      router.push(`/executions/${result.id}`);
    } catch (error) {
      toast.error(errorMessage(error, t.executions.detail.retryErrorFallback));
    }
  }

  if (isLoading || !execution) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  const allLogs: Array<{ nodeId: string | null; event: string; payload?: unknown }> = [
    ...execution.logs,
    ...liveLogs,
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/executions"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
          {t.executions.detail.backLink}
        </Link>
        <div className="mt-1 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-foreground">{execution.workflow.name}</h1>
            <StatusBadge status={toBadgeStatus(execution.status)} labels={t.common.executionStatus} />
          </div>
          {execution.status === "failed" && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setDebuggerOpen(true)}>
                <Stethoscope className="h-3.5 w-3.5" strokeWidth={1.5} />
                {t.executions.detail.diagnoseWithAi}
              </Button>
              <Button size="sm" variant="outline" onClick={onRetry} disabled={retryExecution.isPending}>
                <RotateCw className="h-3.5 w-3.5" strokeWidth={1.5} />
                {t.executions.detail.retry}
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">{t.executions.detail.metricTrigger}</p>
          <p className="font-mono text-sm text-foreground">{execution.triggerType}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">{t.executions.detail.metricDuration}</p>
          <p className="font-mono text-sm text-foreground">
            {execution.durationMs === null ? "—" : formatDuration(execution.durationMs, locale)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">{t.executions.detail.metricTokens}</p>
          <p className="font-mono text-sm text-foreground">{execution.tokensTotal || "—"}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">{t.executions.detail.metricCost}</p>
          <p className="font-mono text-sm text-foreground">
            {execution.costUsd ? formatUsd(execution.costUsd, locale, 4) : "—"}
          </p>
        </div>
      </div>

      {(execution.parentExecutionId || execution.replayFromNodeId) && (
        <p className="text-xs text-muted-foreground">
          {t.executions.detail.replayPrefix}
          {execution.replayFromNodeId
            ? t.executions.detail.replayPartial(execution.replayFromNodeId)
            : t.executions.detail.replayFull}
          {t.executions.detail.replayConnector}
          <Link href={`/executions/${execution.parentExecutionId}`} className="underline">
            {t.executions.detail.replayOfLink}
          </Link>
          .
        </p>
      )}

      {execution.error && (
        <div className="rounded-lg border border-danger/30 bg-danger-subtle p-3">
          <p className="text-xs font-medium text-danger">{t.executions.detail.errorLabel}</p>
          <p className="mt-1 font-mono text-xs text-danger">{execution.error}</p>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-medium text-foreground">{t.executions.detail.timeline}</h2>
        <div className="space-y-2">
          {execution.steps.map((step) => (
            <div key={step.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StatusBadge status={toBadgeStatus(step.status)} labels={t.common.executionStatus} />
                  <span className="font-mono text-sm text-foreground">{step.nodeId}</span>
                  <span className="text-xs text-muted-foreground">{step.nodeType}</span>
                  {step.attempt > 1 && (
                    <span className="text-xs text-muted-foreground">
                      {t.executions.detail.attempt(step.attempt)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    {step.durationMs === null ? "—" : formatDuration(step.durationMs, locale)}
                  </span>
                  {!!step.tokens && <span>{t.executions.detail.tokensSuffix(step.tokens)}</span>}
                  {!!step.costUsd && <span>{formatUsd(step.costUsd, locale, 4)}</span>}
                  {!!step.memoryMb && <span>{formatMegabytes(step.memoryMb, locale)}</span>}
                  <Button size="sm" variant="ghost" onClick={() => setReplayStep(step)}>
                    {t.executions.detail.replayFromHere}
                  </Button>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">
                    {t.executions.detail.inputLabel}
                  </p>
                  <JsonViewer value={step.input} />
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">
                    {step.status === "failed"
                      ? t.executions.detail.errorLabel
                      : t.executions.detail.outputLabel}
                  </p>
                  <JsonViewer value={step.status === "failed" ? step.error : step.output} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-foreground">
          {t.executions.detail.logs}{" "}
          {isLive && <span className="text-xs text-primary">{t.executions.detail.live}</span>}
        </h2>
        <div className="max-h-64 overflow-auto rounded-lg border border-border bg-card p-3 font-mono text-xs">
          {allLogs.length === 0 ? (
            <p className="text-muted-foreground">{t.executions.detail.noLogs}</p>
          ) : (
            allLogs.map((log, index) => (
              <div key={index} className="border-b border-border py-1 last:border-0">
                <span className="text-muted-foreground">[{log.nodeId ?? "—"}]</span>{" "}
                <span className="text-foreground">{log.event}</span>
                {log.payload !== undefined && (
                  <span className="text-muted-foreground"> {JSON.stringify(log.payload)}</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <ReplayFromNodeDialog
        executionId={id}
        step={replayStep}
        onOpenChange={(open) => !open && setReplayStep(null)}
      />
      <DebuggerDialog executionId={id} open={debuggerOpen} onOpenChange={setDebuggerOpen} />
    </div>
  );
}
