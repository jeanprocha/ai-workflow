import { Injectable } from '@nestjs/common';
import { TERMINAL_EXECUTION_STATUSES } from '@workflow/shared';
import { PrismaService } from '../prisma/prisma.service';

const MAX_TIMEOUT_MS = 60_000;
const DEFAULT_TIMEOUT_MS = Number(
  process.env.FLOW_API_DEFAULT_TIMEOUT_MS ?? 30_000,
);
/**
 * Cap de conexoes HTTP presas simultaneamente (nao de Postgres — o SELECT
 * por PK e barato). Sem isso, uma rajada de invokes sincronos prende um
 * socket + um timer por ate 60s cada; estourou, degrada pra 202 na hora em
 * vez de empilhar.
 */
const MAX_SYNC_WAITERS = Number(process.env.FLOW_API_MAX_SYNC_WAITERS ?? 200);

// H2-06: derivado de EXECUTION_PHASE (@workflow/shared) — antes era uma
// allowlist manual desacoplada da de flow-api.controller.ts, e um status
// novo (ex.: waiting_approval) caia no vao entre as duas: o waiter nunca o
// via como terminal (certo), mas o controller tambem nao o via como
// "pending", e devolvia 200 com output:null pra uma execucao so pausada.
const TERMINAL_STATUSES = new Set<string>(TERMINAL_EXECUTION_STATUSES);

export function clampTimeoutMs(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(parsed, 1_000), MAX_TIMEOUT_MS);
}

/**
 * Rampa rapida (fluxo trivial) -> escada (tipico) -> lento (cauda), com
 * jitter de 20% pra uma rajada de invokes concorrentes nao ficar em
 * lockstep batendo no banco todos juntos.
 */
export function nextDelayMs(attempt: number, elapsedMs: number): number {
  const base =
    attempt < 3
      ? [30, 60, 120][attempt]
      : elapsedMs < 3_000
        ? 150
        : elapsedMs < 12_000
          ? 450
          : 1_000;
  return base + Math.floor(Math.random() * base * 0.2);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface WaitedExecution {
  id: string;
  status: string;
  versionId: string;
  outputPayload: unknown;
  error: string | null;
  durationMs: number | null;
}

/**
 * Espera uma Execution chegar a status terminal via POLLING do banco — nao
 * pub/sub. A engine grava status+outputPayload+error num unico UPDATE
 * (engine.service.ts), entao um SELECT que ve status terminal ja ve o
 * output no mesmo snapshot MVCC, sem corrida. O ExecutionEventsService
 * (Redis pub/sub) foi avaliado e descartado pra este uso: subscribe() la
 * nao e aguardado, nao ha replay/buffer, e o subscriber e compartilhado com
 * o SSE do editor — arriscar aquilo por uns 30ms de latencia nao compensa.
 */
@Injectable()
export class ExecutionWaiter {
  private inFlight = 0;

  constructor(private readonly prisma: PrismaService) {}

  /** true = ha vaga pra segurar mais uma conexao HTTP em espera sincrona. */
  hasCapacity(): boolean {
    return this.inFlight < MAX_SYNC_WAITERS;
  }

  async wait(
    executionId: string,
    timeoutMs: number,
    isAborted: () => boolean,
  ): Promise<WaitedExecution | null> {
    this.inFlight += 1;
    try {
      const deadline = Date.now() + timeoutMs;
      const started = Date.now();
      for (let attempt = 0; ; attempt += 1) {
        const execution = await this.prisma.execution.findUnique({
          where: { id: executionId },
          select: {
            id: true,
            status: true,
            versionId: true,
            outputPayload: true,
            error: true,
            durationMs: true,
          },
        });
        if (!execution) return null;
        if (TERMINAL_STATUSES.has(execution.status)) return execution;
        // Cliente desistiu: parar de consultar o banco de graca.
        if (isAborted()) return execution;
        const remaining = deadline - Date.now();
        if (remaining <= 0) return execution; // degrada pra 202 no controller
        await sleep(
          Math.min(nextDelayMs(attempt, Date.now() - started), remaining),
        );
      }
    } finally {
      this.inFlight -= 1;
    }
  }
}
