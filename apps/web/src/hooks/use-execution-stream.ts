import { useEffect, useState } from "react";
import { streamSse } from "@/lib/sse-client";

export type NodeRunStatus = "running" | "success" | "failed";
export type ExecutionRunStatus = "running" | "success" | "failed";

type ExecutionEvent =
  | { type: "execution.started"; executionId: string }
  | { type: "step.started"; executionId: string; nodeId: string }
  | {
      type: "step.completed";
      executionId: string;
      nodeId: string;
      status: "success" | "failed";
      output?: unknown;
      error?: string;
    }
  | { type: "execution.completed"; executionId: string; status: "success" | "failed" };

export interface ExecutionStreamState {
  nodeStatuses: Record<string, NodeRunStatus>;
  executionStatus: ExecutionRunStatus | null;
}

/**
 * Assina o SSE de uma execucao e acumula o status por node — usado para
 * acender os nodes no canvas em tempo real (style.md: "Visualizacao").
 */
export function useExecutionStream(executionId: string | null): ExecutionStreamState {
  const [state, setState] = useState<ExecutionStreamState>({
    nodeStatuses: {},
    executionStatus: null,
  });

  useEffect(() => {
    if (!executionId) return;

    const controller = new AbortController();

    streamSse<ExecutionEvent>(
      `/executions/${executionId}/stream`,
      (event) => {
        setState((prev) => {
          if (event.type === "step.started") {
            return {
              ...prev,
              nodeStatuses: { ...prev.nodeStatuses, [event.nodeId]: "running" },
              executionStatus: "running",
            };
          }
          if (event.type === "step.completed") {
            return {
              ...prev,
              nodeStatuses: { ...prev.nodeStatuses, [event.nodeId]: event.status },
            };
          }
          if (event.type === "execution.completed") {
            return { ...prev, executionStatus: event.status };
          }
          return prev;
        });
      },
      controller.signal,
    ).catch(() => {
      // conexao encerrada (aborto ou execucao ja finalizada) — silencioso
    });

    return () => controller.abort();
  }, [executionId]);

  return state;
}
