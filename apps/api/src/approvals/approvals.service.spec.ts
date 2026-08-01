import { ConflictException, NotFoundException } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';

function buildService(opts: {
  upsertImpl?: jest.Mock;
  findUniqueImpl?: jest.Mock;
  findFirstImpl?: jest.Mock;
  updateManyImpl?: jest.Mock;
  findUniqueOrThrowImpl?: jest.Mock;
}) {
  const prisma = {
    approval: {
      upsert: opts.upsertImpl ?? jest.fn(),
      findUnique: opts.findUniqueImpl ?? jest.fn(),
      findFirst: opts.findFirstImpl ?? jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: opts.updateManyImpl ?? jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue(undefined),
      findUniqueOrThrow:
        opts.findUniqueOrThrowImpl ??
        jest.fn().mockResolvedValue({ executionId: 'exec-1', nodeId: 'A' }),
    },
  };
  const executions = {
    enqueueResume: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ApprovalsService(prisma as never, executions as never);
  return { service, prisma, executions };
}

describe('ApprovalsService.create (H2-06)', () => {
  it('cria a aprovacao via upsert e devolve um link com o token bruto (nunca o hash)', async () => {
    const upsertImpl = jest.fn().mockResolvedValue({ id: 'appr-1' });
    const { service, prisma } = buildService({ upsertImpl });

    const result = await service.create({
      executionId: 'exec-1',
      workspaceId: 'ws-1',
      nodeId: 'A',
      title: 'Aprovar desconto',
      timeoutHours: 24,
      onTimeout: 'reject',
    });

    expect(result.approvalId).toBe('appr-1');
    expect(result.url).toMatch(
      /^http:\/\/localhost:3000\/approve\/[0-9a-f]{64}$/,
    );

    const call = prisma.approval.upsert.mock.calls[0][0];
    expect(call.where).toEqual({
      executionId_nodeId: { executionId: 'exec-1', nodeId: 'A' },
    });
    // O hash gravado nunca e o token bruto que sai na URL.
    const rawToken = result.url.split('/approve/')[1];
    expect(call.create.tokenHash).not.toBe(rawToken);
    expect(call.create.tokenHash).toHaveLength(64);
  });

  it('retry (2a chamada com o mesmo executionId+nodeId) ROTACIONA o token em vez de duplicar', async () => {
    const upsertImpl = jest.fn().mockResolvedValue({ id: 'appr-1' });
    const { service } = buildService({ upsertImpl });

    const first = await service.create({
      executionId: 'exec-1',
      workspaceId: 'ws-1',
      nodeId: 'A',
      title: 'Aprovar desconto',
      timeoutHours: 24,
      onTimeout: 'reject',
    });
    const second = await service.create({
      executionId: 'exec-1',
      workspaceId: 'ws-1',
      nodeId: 'A',
      title: 'Aprovar desconto',
      timeoutHours: 24,
      onTimeout: 'reject',
    });

    // Link anterior para de valer: o segundo token e diferente do primeiro.
    expect(second.url).not.toBe(first.url);
    const secondCall = upsertImpl.mock.calls[1][0];
    // A branch de update reseta qualquer decisao anterior — retry so faz
    // sentido antes de qualquer decisao ter chegado, mas o reset e
    // incondicional por seguranca (nunca deixa lixo de uma tentativa antiga).
    expect(secondCall.update).toEqual(
      expect.objectContaining({
        decidedAt: null,
        decision: null,
        decidedBy: null,
        comment: null,
        resumeEnqueuedAt: null,
        resumeAttempts: 0,
      }),
    );
  });
});

describe('ApprovalsService — consumo atomico da decisao (H2-06)', () => {
  it('decideByToken: count:1 enfileira a retomada e marca resumeEnqueuedAt', async () => {
    const updateManyImpl = jest.fn().mockResolvedValue({ count: 1 });
    const findUniqueImpl = jest.fn().mockResolvedValue({ id: 'appr-1' });
    const { service, executions, prisma } = buildService({
      updateManyImpl,
      findUniqueImpl,
    });

    await service.decideByToken('raw-token', 'approved', 'ok, pode mandar');

    const consumeCall = updateManyImpl.mock.calls[0][0];
    expect(consumeCall.where).toEqual(
      expect.objectContaining({ id: 'appr-1', decidedAt: null }),
    );
    // decideByToken nunca deve expirar: guard "not-expired" -> gt(now).
    expect(consumeCall.where.expiresAt).toHaveProperty('gt');
    expect(consumeCall.data).toEqual(
      expect.objectContaining({
        decision: 'approved',
        comment: 'ok, pode mandar',
        decidedBy: null,
      }),
    );

    expect(executions.enqueueResume).toHaveBeenCalledWith('exec-1', 'A', {
      approved: true,
      comment: 'ok, pode mandar',
      decidedBy: null,
      decidedAt: expect.any(String),
    });
    expect(prisma.approval.update).toHaveBeenCalledWith({
      where: { id: 'appr-1' },
      data: {
        resumeEnqueuedAt: expect.any(Date),
        resumeAttempts: { increment: 1 },
      },
    });
  });

  it('decideByToken: token inexistente lanca NotFoundException sem tocar updateMany', async () => {
    const findUniqueImpl = jest.fn().mockResolvedValue(null);
    const updateManyImpl = jest.fn();
    const { service } = buildService({ findUniqueImpl, updateManyImpl });

    await expect(
      service.decideByToken('token-invalido', 'approved', undefined),
    ).rejects.toThrow(NotFoundException);
    expect(updateManyImpl).not.toHaveBeenCalled();
  });

  it('decideById: count:0 (ja decidida ou expirada) lanca ConflictException e NAO enfileira retomada', async () => {
    const updateManyImpl = jest.fn().mockResolvedValue({ count: 0 });
    const findFirstImpl = jest.fn().mockResolvedValue({ id: 'appr-1' });
    const { service, executions } = buildService({
      updateManyImpl,
      findFirstImpl,
    });

    await expect(
      service.decideById('ws-1', 'appr-1', 'rejected', undefined, 'ana@ex.com'),
    ).rejects.toThrow(ConflictException);
    expect(executions.enqueueResume).not.toHaveBeenCalled();
  });

  it('decideById: aprovacao de outro workspace nao e encontrada (escopo por workspaceId no findFirst)', async () => {
    const findFirstImpl = jest.fn().mockResolvedValue(null);
    const { service } = buildService({ findFirstImpl });

    await expect(
      service.decideById('ws-2', 'appr-1', 'approved', undefined, 'ana@ex.com'),
    ).rejects.toThrow(NotFoundException);
  });

  it('applyTimeout: guard de expiracao e o OPOSTO de decideByToken/decideById (lte, nao gt)', async () => {
    const updateManyImpl = jest.fn().mockResolvedValue({ count: 1 });
    const { service } = buildService({ updateManyImpl });

    const applied = await service.applyTimeout('appr-1', 'approve');

    expect(applied).toBe(true);
    const call = updateManyImpl.mock.calls[0][0];
    expect(call.where.expiresAt).toHaveProperty('lte');
    expect(call.data.decision).toBe('approved');
    expect(call.data.decidedBy).toBe('system:timeout-sweeper');
  });

  it('applyTimeout: perde a corrida pra uma decisao humana (count:0) -> devolve false, nao lanca', async () => {
    const updateManyImpl = jest.fn().mockResolvedValue({ count: 0 });
    const { service } = buildService({ updateManyImpl });

    await expect(service.applyTimeout('appr-1', 'reject')).resolves.toBe(
      false,
    );
  });
});

describe('ApprovalsService.voidOpenApprovals (H2-06)', () => {
  it('fecha so aprovacoes ainda abertas (decidedAt: null) desta execucao', async () => {
    const updateManyImpl = jest.fn().mockResolvedValue({ count: 1 });
    const { service } = buildService({ updateManyImpl });

    await service.voidOpenApprovals('exec-1');

    expect(updateManyImpl).toHaveBeenCalledWith({
      where: { executionId: 'exec-1', decidedAt: null },
      data: { decidedAt: expect.any(Date), decision: 'void' },
    });
  });
});
