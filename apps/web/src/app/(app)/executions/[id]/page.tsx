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
import { ApiError } from "@/lib/api-client";

const SUGGESTION_LABEL: Record<string, string> = {
  retry: "Adicionar Retry",
  timeout: "Aumentar Timeout",
  fallback: "Adicionar Fallback",
};

function DebuggerDialog({
  executionId,
  open,
  onOpenChange,
}: {
  executionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
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
      toast.error(errorMessage(error, "Nao foi possivel diagnosticar esta execucao."));
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
      toast.success("Correcao aplicada — uma nova versao do fluxo foi salva.");
    } catch (error) {
      toast.error(errorMessage(error, "Nao foi possivel aplicar esta correcao."));
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
              AI Debugger
            </span>
          </DialogTitle>
        </DialogHeader>

        {!diagnosis ? (
          <>
            <p className="text-xs text-muted-foreground">
              Analisa o erro, os logs e a config do node que falhou, e sugere causa provavel +
              correcoes aplicaveis com um clique.
            </p>
            <ProviderModelFields idPrefix="debugger" value={aiConfig} onChange={setAiConfig} />
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={onDiagnose} disabled={diagnose.isPending || !aiConfig.model.trim()}>
                {diagnose.isPending ? "Diagnosticando..." : "Diagnosticar"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-border bg-muted p-3">
              <p className="text-xs font-medium text-muted-foreground">Possivel causa</p>
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
                      {SUGGESTION_LABEL[suggestion.tipo] ?? suggestion.tipo}
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
                      {appliedIndex === index ? "Aplicado" : "Aplicar"}
                    </Button>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">Manual</span>
                  )}
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function toBadgeStatus(status: string): ExecutionStatus {
  return status === "canceled" ? "failed" : (status as ExecutionStatus);
}

function formatDuration(ms: number | null) {
  if (ms === null) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
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
      toast.error("Input invalido: precisa ser JSON valido.");
      return;
    }
    try {
      const result = await replay.mutateAsync({
        id: executionId,
        fromNodeId: step.nodeId,
        input: parsed,
      });
      toast.success("Replay parcial enfileirado.");
      onOpenChange(false);
      setInputText("");
      router.push(`/executions/${result.id}`);
    } catch (error) {
      toast.error(errorMessage(error, "Nao foi possivel fazer o replay."));
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
          <DialogTitle>Replay a partir de &ldquo;{step?.nodeId}&rdquo;</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Os nodes anteriores nao serao re-executados — seus outputs originais serao
          reaproveitados. Ajuste o input abaixo e confirme.
        </p>
        <Textarea
          rows={10}
          className="font-mono text-xs"
          value={inputText}
          onChange={(event) => setInputText(event.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={replay.isPending}>
            {replay.isPending ? "Enviando..." : "Rodar replay"}
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
      toast.success("Nova execucao enfileirada.");
      router.push(`/executions/${result.id}`);
    } catch (error) {
      toast.error(errorMessage(error, "Nao foi possivel reexecutar."));
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
          Executions
        </Link>
        <div className="mt-1 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-foreground">{execution.workflow.name}</h1>
            <StatusBadge status={toBadgeStatus(execution.status)} />
          </div>
          {execution.status === "failed" && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setDebuggerOpen(true)}>
                <Stethoscope className="h-3.5 w-3.5" strokeWidth={1.5} />
                Diagnosticar com IA
              </Button>
              <Button size="sm" variant="outline" onClick={onRetry} disabled={retryExecution.isPending}>
                <RotateCw className="h-3.5 w-3.5" strokeWidth={1.5} />
                Reexecutar
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Trigger</p>
          <p className="font-mono text-sm text-foreground">{execution.triggerType}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Duracao</p>
          <p className="font-mono text-sm text-foreground">{formatDuration(execution.durationMs)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Tokens</p>
          <p className="font-mono text-sm text-foreground">{execution.tokensTotal || "—"}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Custo</p>
          <p className="font-mono text-sm text-foreground">
            {execution.costUsd ? `US$ ${execution.costUsd.toFixed(4)}` : "—"}
          </p>
        </div>
      </div>

      {(execution.parentExecutionId || execution.replayFromNodeId) && (
        <p className="text-xs text-muted-foreground">
          Replay
          {execution.replayFromNodeId ? ` parcial a partir de "${execution.replayFromNodeId}"` : " completo"}
          {" de "}
          <Link href={`/executions/${execution.parentExecutionId}`} className="underline">
            outra execucao
          </Link>
          .
        </p>
      )}

      {execution.error && (
        <div className="rounded-lg border border-danger/30 bg-danger-subtle p-3">
          <p className="text-xs font-medium text-danger">Erro</p>
          <p className="mt-1 font-mono text-xs text-danger">{execution.error}</p>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-medium text-foreground">Timeline</h2>
        <div className="space-y-2">
          {execution.steps.map((step) => (
            <div key={step.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StatusBadge status={toBadgeStatus(step.status)} />
                  <span className="font-mono text-sm text-foreground">{step.nodeId}</span>
                  <span className="text-xs text-muted-foreground">{step.nodeType}</span>
                  {step.attempt > 1 && (
                    <span className="text-xs text-muted-foreground">tentativa {step.attempt}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{formatDuration(step.durationMs)}</span>
                  {!!step.tokens && <span>{step.tokens} tok</span>}
                  {!!step.costUsd && <span>US$ {step.costUsd.toFixed(4)}</span>}
                  {!!step.memoryMb && <span>{step.memoryMb.toFixed(0)}MB</span>}
                  <Button size="sm" variant="ghost" onClick={() => setReplayStep(step)}>
                    Replay a partir daqui
                  </Button>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Input</p>
                  <JsonViewer value={step.input} />
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">
                    {step.status === "failed" ? "Erro" : "Output"}
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
          Logs {isLive && <span className="text-xs text-primary">(ao vivo)</span>}
        </h2>
        <div className="max-h-64 overflow-auto rounded-lg border border-border bg-card p-3 font-mono text-xs">
          {allLogs.length === 0 ? (
            <p className="text-muted-foreground">Nenhum log registrado.</p>
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
