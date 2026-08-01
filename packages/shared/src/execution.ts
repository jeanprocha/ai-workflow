export type ExecutionStatus =
  | "queued"
  | "running"
  | "waiting_approval"
  | "success"
  | "failed"
  | "canceled";

/**
 * H2-06: fase de cada status, num Record EXAUSTIVO — adicionar um status
 * novo sem entrada aqui quebra o build (diferente de um `Set`, que aceitaria
 * em silencio). Todo lugar do repo que hoje faz uma allowlist manual de
 * "terminal" ou "pendente" (execution-waiter.ts, flow-api.controller.ts,
 * orphan-recovery.service.ts, executions.processor.ts) deriva daqui — sao
 * duas listas desacopladas hoje, e um status novo cai no vao entre elas.
 */
export const EXECUTION_PHASE: Record<
  ExecutionStatus,
  "pending" | "waiting" | "terminal"
> = {
  queued: "pending",
  running: "pending",
  waiting_approval: "waiting",
  success: "terminal",
  failed: "terminal",
  canceled: "terminal",
};

export const TERMINAL_EXECUTION_STATUSES: readonly ExecutionStatus[] = (
  Object.keys(EXECUTION_PHASE) as ExecutionStatus[]
).filter((status) => EXECUTION_PHASE[status] === "terminal");

export const PENDING_EXECUTION_STATUSES: readonly ExecutionStatus[] = (
  Object.keys(EXECUTION_PHASE) as ExecutionStatus[]
).filter((status) => EXECUTION_PHASE[status] === "pending");

export type TriggerType = "manual" | "webhook" | "cron" | "event" | "chat";

export interface Execution {
  id: string;
  workflowId: string;
  versionId: string;
  status: ExecutionStatus;
  triggerType: TriggerType;
  inputPayload: unknown;
  outputPayload: unknown;
  durationMs: number | null;
  tokensTotal: number;
  costUsd: number;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  parentExecutionId: string | null;
}

export interface ExecutionStep {
  id: string;
  executionId: string;
  nodeId: string;
  nodeType: string;
  status: ExecutionStatus;
  input: unknown;
  output: unknown;
  error: string | null;
  durationMs: number | null;
  tokens: number | null;
  model: string | null;
  costUsd: number | null;
  startedAt: string;
  finishedAt: string | null;
  attempt: number;
  varsPatch: unknown;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface ExecutionLog {
  id: string;
  executionId: string;
  nodeId: string | null;
  level: LogLevel;
  event: string;
  payload: unknown;
  createdAt: string;
}
