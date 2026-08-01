import { Logger } from '@nestjs/common';
import { ErrorWorkflowService } from './error-workflow.service';

beforeAll(() => {
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});

function buildService(opts: {
  execution: Record<string, unknown> | null;
  handler?: Record<string, unknown> | null;
}) {
  const prisma = {
    execution: {
      findUnique: jest.fn().mockResolvedValue(opts.execution),
    },
    workflow: {
      findUnique: jest.fn().mockResolvedValue(opts.handler ?? null),
    },
  };
  const executions = {
    triggerErrorWorkflow: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ErrorWorkflowService(prisma as never, executions as never);
  return { service, prisma, executions };
}

function baseExecution(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exec-1',
    error: 'algo quebrou',
    traceId: 'trace-1',
    triggerType: 'manual',
    workflow: { id: 'wf-a', name: 'Fluxo A', errorWorkflowId: 'wf-b' },
    ...overrides,
  };
}

function baseHandler(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wf-b',
    status: 'active',
    currentVersionId: 'ver-b',
    ...overrides,
  };
}

describe('ErrorWorkflowService', () => {
  it('dispara o error workflow com o payload e o traceId/parentExecutionId corretos', async () => {
    const { service, executions } = buildService({
      execution: baseExecution(),
      handler: baseHandler(),
    });

    await service.dispatchForFailedExecution('exec-1', { failedNodeId: 'n2' });

    expect(executions.triggerErrorWorkflow).toHaveBeenCalledWith(
      'wf-b',
      'ver-b',
      expect.objectContaining({
        workflowId: 'wf-a',
        workflowName: 'Fluxo A',
        executionId: 'exec-1',
        error: 'algo quebrou',
        failedNodeId: 'n2',
        triggerType: 'manual',
      }),
      { parentExecutionId: 'exec-1', traceId: 'trace-1' },
    );
  });

  it('usa executionId como traceId quando a execucao nao tem trace (execucoes pre-Fase-6)', async () => {
    const { service, executions } = buildService({
      execution: baseExecution({ traceId: null }),
      handler: baseHandler(),
    });

    await service.dispatchForFailedExecution('exec-1');

    expect(executions.triggerErrorWorkflow).toHaveBeenCalledWith(
      'wf-b',
      'ver-b',
      expect.anything(),
      { parentExecutionId: 'exec-1', traceId: 'exec-1' },
    );
  });

  it('failedNodeId ausente vira null no payload (fail-fast sem node especifico, ex.: trigger ausente)', async () => {
    const { service, executions } = buildService({
      execution: baseExecution(),
      handler: baseHandler(),
    });

    await service.dispatchForFailedExecution('exec-1');

    expect(executions.triggerErrorWorkflow).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ failedNodeId: null }),
      expect.anything(),
    );
  });

  it('sem errorWorkflowId configurado: nao dispara', async () => {
    const { service, executions } = buildService({
      execution: baseExecution({
        workflow: { id: 'wf-a', name: 'Fluxo A', errorWorkflowId: null },
      }),
    });

    await service.dispatchForFailedExecution('exec-1');

    expect(executions.triggerErrorWorkflow).not.toHaveBeenCalled();
  });

  it('anti-recursao: execucao com triggerType "event" (ja e um tratamento de erro) nunca redispara', async () => {
    const { service, executions } = buildService({
      execution: baseExecution({ triggerType: 'event' }),
      handler: baseHandler(),
    });

    await service.dispatchForFailedExecution('exec-1');

    expect(executions.triggerErrorWorkflow).not.toHaveBeenCalled();
  });

  it('defesa extra: errorWorkflowId apontando pra si mesmo nao dispara (o PATCH ja deveria ter rejeitado)', async () => {
    const { service, executions } = buildService({
      execution: baseExecution({
        workflow: { id: 'wf-a', name: 'Fluxo A', errorWorkflowId: 'wf-a' },
      }),
    });

    await service.dispatchForFailedExecution('exec-1');

    expect(executions.triggerErrorWorkflow).not.toHaveBeenCalled();
  });

  it('tratador arquivado: nao dispara', async () => {
    const { service, executions } = buildService({
      execution: baseExecution(),
      handler: baseHandler({ status: 'archived' }),
    });

    await service.dispatchForFailedExecution('exec-1');

    expect(executions.triggerErrorWorkflow).not.toHaveBeenCalled();
  });

  it('tratador sem versao salva: nao dispara', async () => {
    const { service, executions } = buildService({
      execution: baseExecution(),
      handler: baseHandler({ currentVersionId: null }),
    });

    await service.dispatchForFailedExecution('exec-1');

    expect(executions.triggerErrorWorkflow).not.toHaveBeenCalled();
  });

  it('tratador inexistente (apagado apos o ponteiro ser setado): nao dispara', async () => {
    const { service, executions } = buildService({
      execution: baseExecution(),
      handler: null,
    });

    await service.dispatchForFailedExecution('exec-1');

    expect(executions.triggerErrorWorkflow).not.toHaveBeenCalled();
  });

  it('execucao inexistente: nao dispara, nao lanca', async () => {
    const { service, executions } = buildService({ execution: null });

    await expect(
      service.dispatchForFailedExecution('exec-nao-existe'),
    ).resolves.toBeUndefined();
    expect(executions.triggerErrorWorkflow).not.toHaveBeenCalled();
  });

  it('erro interno (banco fora do ar) nunca propaga pro chamador', async () => {
    const prisma = {
      execution: { findUnique: jest.fn().mockRejectedValue(new Error('DB fora do ar')) },
      workflow: { findUnique: jest.fn() },
    };
    const executions = { triggerErrorWorkflow: jest.fn() };
    const service = new ErrorWorkflowService(prisma as never, executions as never);

    await expect(service.dispatchForFailedExecution('exec-1')).resolves.toBeUndefined();
    expect(executions.triggerErrorWorkflow).not.toHaveBeenCalled();
  });

  it('duas falhas seguidas geram dois dispatches (sem throttle, ao contrario do AlertsService)', async () => {
    const { service, executions } = buildService({
      execution: baseExecution(),
      handler: baseHandler(),
    });

    await service.dispatchForFailedExecution('exec-1');
    await service.dispatchForFailedExecution('exec-1');

    expect(executions.triggerErrorWorkflow).toHaveBeenCalledTimes(2);
  });
});
