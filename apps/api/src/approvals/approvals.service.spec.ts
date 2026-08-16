import { ConflictException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { ApprovalsService } from './approvals.service';

function buildService(opts: {
  upsertImpl?: jest.Mock;
  /** prisma.approval.findUnique — a linha ja existente lida por create(). */
  findUniqueImpl?: jest.Mock;
  /** prisma.approval.findFirst — a busca por token (atual ou anterior) e o escopo por workspace. */
  findFirstImpl?: jest.Mock;
  updateManyImpl?: jest.Mock;
  findUniqueOrThrowImpl?: jest.Mock;
}) {
  const prisma = {
    approval: {
      upsert: opts.upsertImpl ?? jest.fn(),
      findUnique: opts.findUniqueImpl ?? jest.fn().mockResolvedValue(null),
      findFirst: opts.findFirstImpl ?? jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany:
        opts.updateManyImpl ?? jest.fn().mockResolvedValue({ count: 1 }),
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

  it('retry (2a chamada com o mesmo executionId+nodeId) nao duplica e PRESERVA o token da tentativa anterior', async () => {
    const upsertImpl = jest.fn().mockResolvedValue({ id: 'appr-1' });
    // A 1a tentativa ja criou a linha (e pode ter enviado o e-mail) antes de
    // o node morrer: pendencia ainda aberta.
    const findUniqueImpl = jest.fn().mockResolvedValue({
      tokenHash: 'hash-da-1a-tentativa',
      decidedAt: null,
      previousTokenHashes: [],
    });
    const { service, prisma } = buildService({ upsertImpl, findUniqueImpl });

    const second = await service.create({
      executionId: 'exec-1',
      workspaceId: 'ws-1',
      nodeId: 'A',
      title: 'Aprovar desconto',
      timeoutHours: 24,
      onTimeout: 'reject',
    });

    expect(prisma.approval.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { executionId_nodeId: { executionId: 'exec-1', nodeId: 'A' } },
      }),
    );
    const update = upsertImpl.mock.calls[0][0].update;
    // O link novo vale (e o que vai no e-mail desta tentativa)...
    expect(second.url).toMatch(
      /^http:\/\/localhost:3000\/approve\/[0-9a-f]{64}$/,
    );
    expect(update.tokenHash).not.toBe('hash-da-1a-tentativa');
    // ...e o da tentativa anterior TAMBEM continua valendo: se aquele e-mail
    // chegou a sair, o aprovador clica nele e decide normalmente.
    expect(update.previousTokenHashes).toEqual(['hash-da-1a-tentativa']);
  });

  it('3a tentativa: o historico de tokens acumula, nao substitui', async () => {
    const upsertImpl = jest.fn().mockResolvedValue({ id: 'appr-1' });
    const findUniqueImpl = jest.fn().mockResolvedValue({
      tokenHash: 'hash-da-2a',
      decidedAt: null,
      previousTokenHashes: ['hash-da-1a'],
    });
    const { service } = buildService({ upsertImpl, findUniqueImpl });

    await service.create({
      executionId: 'exec-1',
      workspaceId: 'ws-1',
      nodeId: 'A',
      title: 'Aprovar desconto',
      timeoutHours: 24,
      onTimeout: 'reject',
    });

    expect(upsertImpl.mock.calls[0][0].update.previousTokenHashes).toEqual([
      'hash-da-1a',
      'hash-da-2a',
    ]);
  });

  it('pendencia ja decidida: e um ciclo NOVO — zera a decisao e o historico de tokens', async () => {
    const upsertImpl = jest.fn().mockResolvedValue({ id: 'appr-1' });
    const findUniqueImpl = jest.fn().mockResolvedValue({
      tokenHash: 'hash-do-ciclo-anterior',
      decidedAt: new Date('2026-08-01T10:00:00Z'),
      previousTokenHashes: ['hash-mais-antigo'],
    });
    const { service } = buildService({ upsertImpl, findUniqueImpl });

    await service.create({
      executionId: 'exec-1',
      workspaceId: 'ws-1',
      nodeId: 'A',
      title: 'Aprovar desconto',
      timeoutHours: 24,
      onTimeout: 'reject',
    });

    // Nenhum link do ciclo encerrado ressuscita junto com a pendencia.
    expect(upsertImpl.mock.calls[0][0].update).toEqual(
      expect.objectContaining({
        previousTokenHashes: [],
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

describe('ApprovalsService — resolucao do token (H2-06)', () => {
  const rawToken = 'token-bruto-do-e-mail';
  const expectedHash = createHash('sha256').update(rawToken).digest('hex');

  it.each([
    ['findByToken', (s: ApprovalsService) => s.findByToken(rawToken)],
    [
      'decideByToken',
      (s: ApprovalsService) => s.decideByToken(rawToken, 'approved', undefined),
    ],
  ])(
    '%s: casa o hash no token atual OU no de uma tentativa anterior',
    async (_name, call) => {
      const findFirstImpl = jest.fn().mockResolvedValue({ id: 'appr-1' });
      const { service } = buildService({ findFirstImpl });

      await call(service);

      const { where } = findFirstImpl.mock.calls[0][0];
      expect(where.OR).toEqual([
        { tokenHash: expectedHash },
        { previousTokenHashes: { has: expectedHash } },
      ]);
      // O token bruto nunca vai pro banco — nem no where.
      expect(JSON.stringify(where)).not.toContain(rawToken);
    },
  );

  it('findByToken: token que nao casa nem no atual nem no historico -> NotFound', async () => {
    const findFirstImpl = jest.fn().mockResolvedValue(null);
    const { service } = buildService({ findFirstImpl });

    await expect(service.findByToken('token-de-outro-ciclo')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('ApprovalsService — consumo atomico da decisao (H2-06)', () => {
  it('decideByToken: count:1 enfileira a retomada e marca resumeEnqueuedAt', async () => {
    const updateManyImpl = jest.fn().mockResolvedValue({ count: 1 });
    const findFirstImpl = jest.fn().mockResolvedValue({ id: 'appr-1' });
    const { service, executions, prisma } = buildService({
      updateManyImpl,
      findFirstImpl,
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
    const findFirstImpl = jest.fn().mockResolvedValue(null);
    const updateManyImpl = jest.fn();
    const { service } = buildService({ findFirstImpl, updateManyImpl });

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

    await expect(service.applyTimeout('appr-1', 'reject')).resolves.toBe(false);
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
