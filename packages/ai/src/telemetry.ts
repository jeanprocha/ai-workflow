export interface AiTelemetryEvent {
  provider: string;
  operation: "chat" | "embed";
  /** Ausente quando a chamada falha antes do provider responder (ex.: erro de rede). */
  model?: string;
  durationMs: number;
  /** Tempo esperando um slot do rate limiter (acquireProviderSlot), antes da chamada em si. */
  waitMs: number;
  usage?: { inputTokens: number; outputTokens: number } | { tokens: number };
  costUsd?: number;
  ok: boolean;
  error?: string;
}

export type AiTelemetryHandler = (event: AiTelemetryEvent) => void;

let handler: AiTelemetryHandler | null = null;

/**
 * packages/ai e framework-agnostic (zero deps de NestJS/logging/metrics) —
 * quem quiser observar as chamadas de IA (API e worker, via
 * apps/api/src/observability/ai-telemetry.bridge.ts) registra um handler
 * aqui uma vez no bootstrap. Sem handler registrado, emitTelemetry() e um
 * no-op (ex.: em testes unitarios do proprio pacote).
 */
export function setTelemetryHandler(fn: AiTelemetryHandler | null): void {
  handler = fn;
}

export function emitTelemetry(event: AiTelemetryEvent): void {
  handler?.(event);
}
