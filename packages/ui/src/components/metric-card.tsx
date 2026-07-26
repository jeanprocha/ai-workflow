import type { ElementType } from "react";

export interface MetricCardProps {
  label: string;
  value: string;
  delta?: {
    direction: "up" | "down";
    value: string;
  };
  className?: string;
  /**
   * Torna o card um link. Uma metrica que aponta um problema ("Falhas: 3")
   * deveria levar ate ele — sem isso o dashboard so constata, e o usuario
   * tem que ir achar sozinho o que quebrou.
   */
  href?: string;
  /**
   * Componente de link do app consumidor (ex.: next/link). Sem isso cai num
   * <a> nativo, que num SPA recarrega a pagina inteira — este pacote nao
   * pode importar o roteador de nenhum framework, entao quem sabe qual e
   * injeta aqui.
   */
  linkComponent?: ElementType;
}

/**
 * Card de metrica do Dashboard (style.md 8.5). Sem icones decorativos,
 * sem sparkline — isso fica reservado para a tela de Analytics (Fase 6).
 */
export function MetricCard({
  label,
  value,
  delta,
  className,
  href,
  linkComponent,
}: MetricCardProps) {
  const Root: ElementType = href ? (linkComponent ?? "a") : "div";
  const rootProps = href
    ? { href, "aria-label": label }
    : { role: "group" as const, "aria-label": label };

  return (
    <Root
      {...rootProps}
      className={
        "block rounded-lg border border-border bg-card p-4" +
        (href
          ? " outline-none transition-colors hover:border-border-strong focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          : "") +
        (className ? ` ${className}` : "")
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
    </Root>
  );
}
