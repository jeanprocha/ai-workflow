// execution-waiter.ts importa TERMINAL_EXECUTION_STATUSES de @workflow/shared
// em runtime (H2-06) — dist ESM puro, incompativel com o ts-jest do api
// rodando em CJS. Mesma familia de mock que engine.service.spec.ts.
jest.mock('@workflow/shared', () => ({
  TERMINAL_EXECUTION_STATUSES: ['success', 'failed', 'canceled'],
}));

import { ExecutionWaiter, clampTimeoutMs } from './execution-waiter';

function terminal(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'exec-1',
    status: 'success',
    versionId: 'v1',
    outputPayload: { ok: true },
    error: null,
    durationMs: 42,
    ...overrides,
  };
}

function buildWaiter(findUnique: jest.Mock) {
  const prisma = { execution: { findUnique } };
  return new ExecutionWaiter(prisma as never);
}

describe('ExecutionWaiter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('ja terminal no primeiro poll: retorna sem dormir nenhuma vez', async () => {
    const findUnique = jest.fn().mockResolvedValue(terminal());
    const waiter = buildWaiter(findUnique);

    const result = await waiter.wait('exec-1', 30_000, () => false);

    expect(result?.status).toBe('success');
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('poll varias vezes ate a execucao terminar', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(terminal({ status: 'running', outputPayload: null }))
      .mockResolvedValueOnce(terminal({ status: 'running', outputPayload: null }))
      .mockResolvedValueOnce(terminal());
    const waiter = buildWaiter(findUnique);

    const promise = waiter.wait('exec-1', 30_000, () => false);
    await jest.advanceTimersByTimeAsync(1_000);
    const result = await promise;

    expect(result?.status).toBe('success');
    expect(findUnique).toHaveBeenCalledTimes(3);
  });

  it('estoura o timeout: devolve o ultimo estado visto, sem lancar', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValue(terminal({ status: 'running', outputPayload: null }));
    const waiter = buildWaiter(findUnique);

    const promise = waiter.wait('exec-1', 500, () => false);
    await jest.advanceTimersByTimeAsync(2_000);
    const result = await promise;

    expect(result?.status).toBe('running');
  });

  it('aborto no meio do polling: para de consultar e devolve o estado atual', async () => {
    let aborted = false;
    const findUnique = jest
      .fn()
      .mockResolvedValue(terminal({ status: 'running', outputPayload: null }));
    const waiter = buildWaiter(findUnique);

    const promise = waiter.wait('exec-1', 30_000, () => aborted);
    await jest.advanceTimersByTimeAsync(0);
    aborted = true;
    await jest.advanceTimersByTimeAsync(5_000);
    const result = await promise;

    expect(result?.status).toBe('running');
    expect(findUnique.mock.calls.length).toBeLessThan(5);
  });

  it('execucao inexistente: devolve null sem tentar de novo', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const waiter = buildWaiter(findUnique);

    const result = await waiter.wait('nao-existe', 30_000, () => false);

    expect(result).toBeNull();
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('H2-06: waiting_approval nao e terminal — estoura o timeout em vez de "terminar" a pausa', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValue(
        terminal({ status: 'waiting_approval', outputPayload: null }),
      );
    const waiter = buildWaiter(findUnique);

    const promise = waiter.wait('exec-1', 500, () => false);
    await jest.advanceTimersByTimeAsync(2_000);
    const result = await promise;

    // Continuou consultando ate o timeout (nao devolveu no 1o poll como
    // "terminal") — o controller e quem decide 202 vs 200 a partir disto.
    expect(result?.status).toBe('waiting_approval');
    expect(findUnique.mock.calls.length).toBeGreaterThan(1);
  });

  it('hasCapacity nao vaza: volta a true depois que o wait termina', async () => {
    const findUnique = jest.fn().mockResolvedValue(terminal());
    const waiter = buildWaiter(findUnique);

    expect(waiter.hasCapacity()).toBe(true);
    await waiter.wait('exec-1', 30_000, () => false);
    expect(waiter.hasCapacity()).toBe(true);
  });
});

describe('clampTimeoutMs', () => {
  it('cai no default quando ausente ou invalido', () => {
    expect(clampTimeoutMs(undefined)).toBe(30_000);
    expect(clampTimeoutMs('abc')).toBe(30_000);
    expect(clampTimeoutMs('-5')).toBe(30_000);
    expect(clampTimeoutMs('0')).toBe(30_000);
  });

  it('respeita o piso de 1s', () => {
    expect(clampTimeoutMs('10')).toBe(1_000);
  });

  it('respeita o teto de 60s', () => {
    expect(clampTimeoutMs('999999')).toBe(60_000);
  });

  it('passa direto valores dentro da faixa', () => {
    expect(clampTimeoutMs('5000')).toBe(5_000);
  });
});
