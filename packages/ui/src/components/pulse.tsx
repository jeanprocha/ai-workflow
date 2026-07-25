/**
 * O Pulso — elemento de assinatura do design system (ver style.md secao 1).
 * Usado em exatamente 4 lugares: edge do canvas em execucao, indicador de
 * execucao ao vivo, loading da aplicacao e a marca. Fora desses contextos,
 * nao deve ser usado — a raridade e o que o torna memoravel.
 */

export type PulseVariant = "dot" | "bar";

export interface PulseProps {
  variant?: PulseVariant;
  className?: string;
  /** Tamanho do dot em px (variant="dot") ou altura da barra em px (variant="bar"). */
  size?: number;
  /** aria-label pro screen reader — fallback pt-BR se o app consumidor nao passar (i18n fica por conta do app). */
  ariaLabel?: string;
}

function joinClassNames(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

export function Pulse({ variant = "dot", className, size, ariaLabel }: PulseProps) {
  if (variant === "bar") {
    return (
      <div
        className={joinClassNames("relative w-full overflow-hidden bg-border", className)}
        style={{ height: size ?? 2 }}
        role="status"
        aria-label={ariaLabel ?? "Carregando"}
      >
        <span
          className="absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-primary motion-reduce:left-1/2 motion-reduce:animate-none"
          style={{
            animation: "wf-pulse-travel 1.2s linear infinite",
          }}
        />
      </div>
    );
  }

  const dotSize = size ?? 8;
  return (
    <span
      className={joinClassNames("relative inline-flex", className)}
      style={{ width: dotSize, height: dotSize }}
      role="status"
      aria-label={ariaLabel ?? "Em execucao"}
    >
      <span
        className="absolute inset-0 rounded-full bg-primary motion-reduce:animate-none"
        style={{ animation: "wf-pulse-breathe 1.2s ease-in-out infinite" }}
      />
    </span>
  );
}
