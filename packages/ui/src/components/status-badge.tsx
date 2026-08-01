import { Check, X, Circle, RotateCw, ShieldAlert, Hourglass } from "lucide-react";
import { Pulse } from "./pulse";

export type ExecutionStatus =
  | "running"
  | "success"
  | "failed"
  | "queued"
  | "retry"
  | "handled"
  | "waiting_approval";

export type StatusBadgeLabels = Record<ExecutionStatus, string>;

/** Fallback pt-BR pra quem consome o componente sem passar `labels` (i18n fica por conta do app). */
const DEFAULT_LABELS: StatusBadgeLabels = {
  running: "Executando",
  success: "Sucesso",
  failed: "Falhou",
  queued: "Na fila",
  retry: "Retentando",
  // "handled" e derivado no app (H2-05: step failed dentro de execucao
  // success) — nunca vem do backend como status de execucao de verdade.
  handled: "Falha tratada",
  // "waiting_approval" (H2-06) e status real de execucao/step, persistido.
  waiting_approval: "Aguardando aprovação",
};

const STYLES: Record<ExecutionStatus, string> = {
  running: "bg-accent-subtle text-primary",
  success: "bg-success-subtle text-success",
  failed: "bg-danger-subtle text-danger",
  queued: "bg-muted text-queued",
  retry: "bg-warning-subtle text-warning",
  handled: "bg-warning-subtle text-warning",
  waiting_approval: "bg-warning-subtle text-warning",
};

function StatusIcon({ status }: { status: ExecutionStatus }) {
  switch (status) {
    case "running":
      return <Pulse variant="dot" size={8} />;
    case "success":
      return <Check className="h-3 w-3" strokeWidth={2.5} />;
    case "failed":
      return <X className="h-3 w-3" strokeWidth={2.5} />;
    case "retry":
      return <RotateCw className="h-3 w-3" strokeWidth={2.5} />;
    case "queued":
      return <Circle className="h-3 w-3" strokeWidth={2.5} />;
    case "handled":
      return <ShieldAlert className="h-3 w-3" strokeWidth={2.5} />;
    case "waiting_approval":
      return <Hourglass className="h-3 w-3" strokeWidth={2.5} />;
  }
}

export interface StatusBadgeProps {
  status: ExecutionStatus;
  className?: string;
  labels?: StatusBadgeLabels;
}

/**
 * Estado nunca e comunicado so por cor (style.md 2.4): sempre cor + forma + label.
 */
export function StatusBadge({ status, className, labels = DEFAULT_LABELS }: StatusBadgeProps) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium " +
        STYLES[status] +
        (className ? ` ${className}` : "")
      }
    >
      <StatusIcon status={status} />
      {labels[status]}
    </span>
  );
}
