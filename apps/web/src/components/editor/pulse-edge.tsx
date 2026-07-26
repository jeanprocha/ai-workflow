"use client";

import { BaseEdge, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

export type PulseEdgeStatus = "running" | "success" | "failed";

export type PulseEdgeData = { status?: PulseEdgeStatus };
export type PulseEdgeType = Edge<PulseEdgeData, "pulse">;

/**
 * A assinatura do design system (style.md secao 1): um ponto percorrendo a
 * linha, "dados fluindo por um fio". Este e o primeiro dos quatro contextos
 * onde O Pulso pode aparecer — a edge que esta recebendo dados durante uma
 * execucao ao vivo.
 *
 * `<animateMotion>` foi escolhido em vez de dash animado (o `animated` nativo
 * do React Flow) porque a marca e um PONTO percorrendo o fio, nao tracejado
 * marchando. Como SVG SMIL ignora prefers-reduced-motion, a preferencia e
 * lida em JS e o ponto vira estatico no meio do caminho.
 */
export function PulseEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps<PulseEdgeType>) {
  const reducedMotion = useReducedMotion();
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const status = data?.status;
  const stroke =
    status === "running"
      ? "var(--primary)"
      : status === "failed"
        ? "var(--danger)"
        : "var(--border-strong)";

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{ stroke, strokeWidth: status === "running" ? 2 : 1.5 }}
      />
      {status === "running" &&
        (reducedMotion ? (
          // Estado estatico equivalente (style.md 5: "o Pulso vira um dot
          // fixo colorido"): o ponto marca o meio do fio sem se mover.
          <circle cx={labelX} cy={labelY} r={3} fill="var(--primary)" />
        ) : (
          <circle r={3} fill="var(--primary)">
            <animateMotion dur="1.2s" repeatCount="indefinite" path={path} />
          </circle>
        ))}
    </>
  );
}

export const EDGE_TYPES = { pulse: PulseEdge };
