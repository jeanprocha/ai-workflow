import { ConflictException, NotFoundException } from '@nestjs/common';
import { ExecutionsService } from './executions.service';

function buildService(workflow: Record<string, unknown> | null) {
  const prisma = {
    workflow: {
      findUnique: jest.fn().mockResolvedValue(workflow),
    },
    execution: {
      create: jest.fn().mockResolvedValue({ id: 'exec-1', status: 'queued' }),
    },
  };
  const queue = { add: jest.fn().mockResolvedValue(undefined) };
  const service = new ExecutionsService(prisma as never, queue as never);
  return { service, prisma, queue };
}

describe('ExecutionsService.triggerByWebhook', () => {
  it('workflow arquivado: lanca NotFoundException e nao cria nem enfileira execucao', async () => {
    const { service, prisma, queue } = buildService({
      status: 'archived',
    });

    await expect(service.triggerByWebhook('wh-1', {})).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.execution.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('workflow em draft: cria e enfileira normalmente (so archived gateia)', async () => {
    const { service, prisma, queue } = buildService({
      status: 'draft',
      currentVersionId: 'ver-1',
    });

    await service.triggerByWebhook('wh-1', {});

    expect(prisma.execution.create).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('webhookId inexistente: mesma mensagem do caso arquivado (nao vaza existencia do recurso)', async () => {
    const { service } = buildService(null);

    await expect(service.triggerByWebhook('wh-1', {})).rejects.toThrow(
      'Webhook nao encontrado.',
    );
  });
});

describe('ExecutionsService.trigger (execucao manual do editor)', () => {
  it('workflow arquivado: cria normalmente — o gate de archived nao se aplica aqui', async () => {
    const prisma = {
      workflow: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'wf-1',
          status: 'archived',
          currentVersionId: 'ver-1',
        }),
      },
      execution: {
        create: jest.fn().mockResolvedValue({ id: 'exec-1' }),
      },
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const service = new ExecutionsService(prisma as never, queue as never);

    await service.trigger('ws-1', 'wf-1', 'manual', {});

    expect(prisma.execution.create).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledTimes(1);
  });
});

describe('ExecutionsService.retry / .replay — 409 em waiting_approval (H2-06)', () => {
  function buildServiceForOriginal(original: Record<string, unknown>) {
    const prisma = {
      execution: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exec-1',
          workflowId: 'wf-1',
          versionId: 'ver-1',
          triggerType: 'manual',
          inputPayload: { seed: true },
          traceId: 'exec-1',
          steps: [],
          ...original,
        }),
        create: jest.fn().mockResolvedValue({ id: 'exec-2' }),
      },
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const service = new ExecutionsService(prisma as never, queue as never);
    return { service, prisma, queue };
  }

  it('retry: execucao waiting_approval lanca ConflictException e nao cria uma nova execucao', async () => {
    const { service, prisma, queue } = buildServiceForOriginal({
      status: 'waiting_approval',
    });

    await expect(service.retry('ws-1', 'exec-1')).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.execution.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('replay: execucao waiting_approval lanca ConflictException antes de olhar dto.fromNodeId', async () => {
    const { service, prisma } = buildServiceForOriginal({
      status: 'waiting_approval',
    });

    await expect(service.replay('ws-1', 'exec-1', {})).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.execution.create).not.toHaveBeenCalled();
  });

  it('retry: execucao failed (nao waiting_approval) continua funcionando normalmente', async () => {
    const { service, prisma, queue } = buildServiceForOriginal({
      status: 'failed',
    });

    await service.retry('ws-1', 'exec-1');

    expect(prisma.execution.create).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledTimes(1);
  });
});
