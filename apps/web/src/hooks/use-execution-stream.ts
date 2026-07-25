import { useEffect, useState } from "react";
import { streamSse, type SseConnectionStatus } from "@/lib/sse-client";

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
  /** "reconnecting" sinaliza queda momentanea da conexao (ver sse-client.ts) — util pra um indicador discreto na UI. */
  connectionStatus: SseConnectionStatus;
}

/**
 * Assina o SSE de uma execucao e acumula o status por node — usado para
 * acender os nodes no canvas em tempo real (style.md: "Visualizacao").
 */
export function useExecutionStream(executionId: string | null): ExecutionStreamState {
  const [state, setState] = useState<ExecutionStreamState>({
    nodeStatuses: {},
    executionStatus: null,
    connectionStatus: "connecting",
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
      (connectionStatus) => setState((prev) => ({ ...prev, connectionStatus })),
    ).catch(() => {
      // streamSse ja trata reconexao internamente — chegar aqui so acontece
      // num erro verdadeiramente irrecuperavel, entao so evita unhandled rejection.
    });

    return () => controller.abort();
  }, [executionId]);

  return state;
}
