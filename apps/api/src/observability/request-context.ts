import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Contexto de correlacao propagado por toda a vida de uma request HTTP, job
 * de fila ou execucao de engine — um unico mecanismo (AsyncLocalStorage) usado
 * tanto na API quanto no worker (apps/api/src/worker.main.ts), ja que os dois
 * compartilham o mesmo codebase.
 *
 * `requestId`: gerado (ou lido de x-request-id) por request HTTP; propagado
 * pro job da fila via `_ctx` no data (ver executions.service.ts) e do job pro
 * engine. `traceId`: agrupa uma execucao com seus replays (ja existe indexado
 * em Execution). `testRun`: injetado pelo Playwright (Fase 7) pra correlacionar
 * teste -> request -> log.
 */
export interface ObsContext {
  requestId?: string;
  testRun?: string;
  userId?: string;
  workspaceId?: string;
  executionId?: string;
  traceId?: string;
  jobId?: string;
  queue?: string;
}

const storage = new AsyncLocalStorage<ObsContext>();

export function runWithContext<T>(context: ObsContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getContext(): ObsContext | undefined {
  return storage.getStore();
}

/** Adiciona/sobrescreve campos no contexto atual — no-op se nao houver contexto aberto. */
export function mergeContext(partial: Partial<ObsContext>): void {
  const current = storage.getStore();
  if (current) Object.assign(current, partial);
}
