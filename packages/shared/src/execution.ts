export type ExecutionStatus =
  | "queued"
  | "running"
  | "success"
  | "failed"
  | "canceled";

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
