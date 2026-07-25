import { useEffect, useState } from "react";
import { streamSse, type SseConnectionStatus } from "@/lib/sse-client";

type LiveEvent =
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
  | {
      type: "log.created";
      executionId: string;
      nodeId: string | null;
      level: string;
      event: string;
      payload?: unknown;
    }
  | { type: "execution.completed"; executionId: string; status: "success" | "failed" };

export interface LiveLogEntry {
  nodeId: string | null;
  level: string;
  event: string;
  payload?: unknown;
  at: number;
}

export interface ExecutionLiveState {
  logs: LiveLogEntry[];
  finished: boolean;
  connectionStatus: SseConnectionStatus;
}

/**
 * Assina o SSE de uma execucao para exibir logs ao vivo na tela de detalhe
 * (Fase 6). Independente de useExecutionStream (usado no canvas) para nao
 * acoplar os dois consumidores.
 */
export function useExecutionLive(
  executionId: string | null,
  active: boolean,
): ExecutionLiveState {
  const [state, setState] = useState<ExecutionLiveState>({
    logs: [],
    finished: false,
    connectionStatus: "connecting",
  });

  useEffect(() => {
    if (!executionId || !active) return;

    const controller = new AbortController();
    streamSse<LiveEvent>(
      `/executions/${executionId}/stream`,
      (event) => {
        if (event.type === "log.created") {
          setState((prev) => ({
            ...prev,
            logs: [
              ...prev.logs,
              {
                nodeId: event.nodeId,
                level: event.level,
                event: event.event,
                payload: event.payload,
                at: Date.now(),
              },
            ],
          }));
        }
        if (event.type === "execution.completed") {
          setState((prev) => ({ ...prev, finished: true }));
        }
      },
      controller.signal,
      (connectionStatus) => setState((prev) => ({ ...prev, connectionStatus })),
    ).catch(() => {
      // streamSse ja trata reconexao internamente — chegar aqui so acontece
      // num erro verdadeiramente irrecuperavel, entao so evita unhandled rejection.
    });

    return () => controller.abort();
  }, [executionId, active]);

  return state;
}
