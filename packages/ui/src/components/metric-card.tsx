export interface MetricCardProps {
  label: string;
  value: string;
  delta?: {
    direction: "up" | "down";
    value: string;
  };
  className?: string;
}

/**
 * Card de metrica do Dashboard (style.md 8.5). Sem icones decorativos,
 * sem sparkline — isso fica reservado para a tela de Analytics (Fase 6).
 */
export function MetricCard({ label, value, delta, className }: MetricCardProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={
        "rounded-lg border border-border bg-card p-4" + (className ? ` ${className}` : "")
      }
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="tabular font-mono text-xl font-semibold text-foreground">{value}</span>
        {delta && (
          <span
            className={
              "text-xs font-medium " + (delta.direction === "up" ? "text-success" : "text-danger")
            }
          >
            {delta.direction === "up" ? "▲" : "▼"} {delta.value}
          </span>
        )}
      </div>
    </div>
  );
}
