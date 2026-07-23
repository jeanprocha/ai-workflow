import { Check, X, Circle, RotateCw } from "lucide-react";
import { Pulse } from "./pulse";

export type ExecutionStatus = "running" | "success" | "failed" | "queued" | "retry";

const LABELS: Record<ExecutionStatus, string> = {
  running: "Executando",
  success: "Sucesso",
  failed: "Falhou",
  queued: "Na fila",
  retry: "Retentando",
};

const STYLES: Record<ExecutionStatus, string> = {
  running: "bg-accent-subtle text-primary",
  success: "bg-success-subtle text-success",
  failed: "bg-danger-subtle text-danger",
  queued: "bg-muted text-queued",
  retry: "bg-warning-subtle text-warning",
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
  }
}

export interface StatusBadgeProps {
  status: ExecutionStatus;
  className?: string;
}

/**
 * Estado nunca e comunicado so por cor (style.md 2.4): sempre cor + forma + label.
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium " +
        STYLES[status] +
        (className ? ` ${className}` : "")
      }
    >
      <StatusIcon status={status} />
      {LABELS[status]}
    </span>
  );
}
