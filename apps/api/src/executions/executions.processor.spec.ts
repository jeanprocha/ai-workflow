import { Logger } from '@nestjs/common';
import { ExecutionsProcessor } from './executions.processor';

// ExecutionsProcessor importa EngineService, que importa @workflow/nodes —
// pacote ESM puro (dist/index.js "export * from..."), incompativel com o
// jest do api rodando ts-jest em CJS. Mesmo mock de engine.service.spec.ts:
// so precisa ser truthy/no-op, o processor nunca chama EngineService de
// verdade nestes testes (e mockado inteiro via buildProcessor).
jest.mock('@workflow/nodes', () => ({
  getNodeDefinition: jest.fn((type: string) => ({ type })),
  resolveExpressions: jest.fn((value: unknown) => value),
}));
jest.mock('@workflow/ai', () => ({
  emitTelemetry: jest.fn(),
}));
// Mesma familia: EngineService importa ERROR_HANDLE de @workflow/shared em
// runtime (H2-05), dist tambem ESM puro. PENDING_EXECUTION_STATUSES (H2-06)
// e o proprio ExecutionsProcessor que usa, direto.
jest.mock('@workflow/shared', () => ({
  ERROR_HANDLE: 'error',
  PENDING_EXECUTION_STATUSES: ['queued', 'running'],
}));

beforeAll(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

function buildProcessor(opts: {
  engineRun?: jest.Mock;
  updateManyCount?: number;
  updateManyImpl?: jest.Mock;
}) {
  const engine = { run: opts.engineRun ?? jest.fn().mockResolvedValue(undefined) };
  const metrics = {};
  const prisma = {
    execution: {
      updateMany:
        opts.updateManyImpl ??
        jest.fn().mockResolvedValue({ count: opts.updateManyCount ?? 1 }),
    },
  };
  const events = { emit: jest.fn() };
  const errorWorkflows = {
    dispatchForFailedExecution: jest.fn().mockResolvedValue(undefined),
  };
  const approvals = {
    voidOpenApprovals: jest.fn().mockResolvedValue(undefined),
  };
  const processor = new ExecutionsProcessor(
    engine as never,
    metrics as never,
    prisma as never,
    events as never,
    errorWorkflows as never,
    approvals as never,
  );
  return { processor, engine, prisma, events, errorWorkflows, approvals };
}

function buildJob(executionId = 'exec-1') {
  return { id: 'job-1', data: { executionId } } as never;
}

describe('ExecutionsProcessor — rede de seguranca (H2-04)', () => {
  it('caminho feliz: engine.run resolve, nenhuma atualizacao de emergencia acontece', async () => {
    const { processor, prisma, events } = buildProcessor({});

    await processor.process(buildJob());

    expect(prisma.execution.updateMany).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('engine.run lanca: marca a execucao como failed, emite execution.completed, e RE-LANCA o erro original', async () => {
    const engineRun = jest.fn().mockRejectedValue(new Error('versao apagada'));
    const { processor, prisma, events, errorWorkflows, approvals } = buildProcessor({
      engineRun,
      updateManyCount: 1,
    });

    await expect(processor.process(buildJob('exec-1'))).rejects.toThrow(
      'versao apagada',
    );

    expect(prisma.execution.updateMany).toHaveBeenCalledWith({
      where: { id: 'exec-1', status: { in: ['queued', 'running'] } },
      data: expect.objectContaining({ status: 'failed', error: 'versao apagada' }),
    });
    expect(events.emit).toHaveBeenCalledWith({
      type: 'execution.completed',
      executionId: 'exec-1',
      status: 'failed',
    });
    // H2-05: mesmo ponto de extensao do engine.
    expect(errorWorkflows.dispatchForFailedExecution).toHaveBeenCalledWith('exec-1');
    // H2-06: fecha qualquer Approval que o RPC tenha criado antes do crash.
    expect(approvals.voidOpenApprovals).toHaveBeenCalledWith('exec-1');
  });

  it('execucao ja tinha status terminal (count:0): nao emite completed de novo nem dispara o error workflow (idempotente)', async () => {
    const engineRun = jest.fn().mockRejectedValue(new Error('erro tardio'));
    const { processor, events, errorWorkflows, approvals } = buildProcessor({
      engineRun,
      updateManyCount: 0,
    });

    await expect(processor.process(buildJob())).rejects.toThrow('erro tardio');

    expect(events.emit).not.toHaveBeenCalled();
    expect(errorWorkflows.dispatchForFailedExecution).not.toHaveBeenCalled();
    expect(approvals.voidOpenApprovals).not.toHaveBeenCalled();
  });

  it('ate o updateMany de emergencia falha (banco fora do ar): ainda assim re-lanca o erro ORIGINAL, sem travar', async () => {
    const engineRun = jest.fn().mockRejectedValue(new Error('erro original da engine'));
    const updateManyImpl = jest.fn().mockRejectedValue(new Error('DB fora do ar'));
    const { processor } = buildProcessor({ engineRun, updateManyImpl });

    await expect(processor.process(buildJob())).rejects.toThrow(
      'erro original da engine',
    );
  });
});
