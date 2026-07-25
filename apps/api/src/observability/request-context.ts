import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

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

/** Subconjunto do ObsContext que viaja junto com o data de um job BullMQ. */
export interface JobContext {
  requestId?: string;
  testRun?: string;
  traceId?: string;
}

/**
 * Anexa o contexto de correlacao ATUAL (se houver uma request HTTP aberta)
 * ao data de um job, no momento do `queue.add()`. Usado so nos enqueues
 * "on-demand" (executions.service.ts, knowledge ingestion) — jobs repetiveis
 * (cron do scheduler, health-check do MCP) sao registrados uma vez so e o
 * BullMQ reusa o mesmo `data` em toda disparada futura, entao anexar aqui
 * nao ajudaria (o _ctx ficaria congelado no momento do registro, nao da
 * disparada real) — esses ganham um requestId fresco a cada processamento
 * via runJobInContext() abaixo.
 */
export function withJobContext<T extends object>(
  data: T,
): T & { _ctx: JobContext } {
  const current = getContext();
  return {
    ...data,
    _ctx: {
      requestId: current?.requestId,
      testRun: current?.testRun,
      traceId: current?.traceId,
    },
  };
}

/**
 * Abre um contexto ALS novo pro processamento de um job — chamado no topo de
 * cada Processor.process(). Reusa o requestId de quem enfileirou (se
 * houver, via withJobContext); senão gera um fresco prefixado pela fila
 * (cobre jobs repetiveis e qualquer job antigo sem _ctx).
 */
export function runJobInContext<T>(
  queue: string,
  job: { id?: string; data: { _ctx?: JobContext } },
  fn: () => Promise<T>,
): Promise<T> {
  const jobCtx = job.data._ctx;
  return runWithContext(
    {
      requestId: jobCtx?.requestId ?? `${queue}-${randomUUID()}`,
      testRun: jobCtx?.testRun,
      traceId: jobCtx?.traceId,
      jobId: job.id,
      queue,
    },
    fn,
  );
}
