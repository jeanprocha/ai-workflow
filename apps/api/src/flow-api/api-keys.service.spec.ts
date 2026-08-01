import { NotFoundException } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';

/** Simula a projecao real do Prisma `select` — sem isso, um teste que so
 * fizesse `{ id, ...data }` passaria mesmo se o service esquecesse o select
 * e vazasse keyHash por spread. */
function project<T extends Record<string, unknown>>(
  full: T,
  select?: Record<string, boolean>,
): Partial<T> {
  if (!select) return full;
  const projected: Partial<T> = {};
  for (const key of Object.keys(select)) {
    if (select[key as keyof T & string]) {
      (projected as Record<string, unknown>)[key] = full[key];
    }
  }
  return projected;
}

function buildService(opts: { workflowExists?: boolean } = {}) {
  const stored: Array<Record<string, unknown>> = [];
  let nextId = 1;

  const prisma = {
    workflow: {
      findFirst: jest.fn().mockResolvedValue(
        opts.workflowExists === false ? null : { id: 'wf-1' },
      ),
    },
    workflowApiKey: {
      findMany: jest.fn(
        async ({ select }: { select?: Record<string, boolean> }) =>
          stored.map((row) => project(row, select)),
      ),
      create: jest.fn(
        async ({
          data,
          select,
        }: {
          data: Record<string, unknown>;
          select?: Record<string, boolean>;
        }) => {
          const full = {
            id: `key-${nextId++}`,
            createdAt: new Date(),
            lastUsedAt: null,
            revokedAt: null,
            ...data,
          };
          stored.push(full);
          return project(full, select);
        },
      ),
      findUnique: jest.fn(async ({ where }: { where: { keyHash: string } }) =>
        stored.find((row) => row.keyHash === where.keyHash) ?? null,
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; workflowId: string; revokedAt: null };
          data: Record<string, unknown>;
        }) => {
          const row = stored.find(
            (r) =>
              r.id === where.id &&
              r.workflowId === where.workflowId &&
              r.revokedAt === null,
          );
          if (!row) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        },
      ),
      update: jest.fn().mockResolvedValue(undefined),
    },
  };

  const service = new ApiKeysService(prisma as never);
  return { service, prisma, stored };
}

describe('ApiKeysService.create', () => {
  it('devolve uma chave com prefixo wfk_ e 68 caracteres; o valor bruto so existe nesta resposta', async () => {
    const { service, stored } = buildService();

    const result = await service.create('ws-1', 'wf-1', { name: 'Producao' });

    expect(result.key).toMatch(/^wfk_[0-9a-f]{64}$/);
    expect(result.key).toHaveLength(68);
    expect((result as Record<string, unknown>).keyHash).toBeUndefined();
    expect(stored[0]?.keyHash).toBeDefined();
    expect(stored[0]?.keyHash).not.toBe(result.key);
  });

  it('duas chamadas geram chaves diferentes (nao deterministico)', async () => {
    const { service } = buildService();

    const first = await service.create('ws-1', 'wf-1', { name: 'A' });
    const second = await service.create('ws-1', 'wf-1', { name: 'B' });

    expect(first.key).not.toBe(second.key);
  });

  it('fluxo de outro workspace (ou inexistente): NotFoundException, nada gravado', async () => {
    const { service, prisma } = buildService({ workflowExists: false });

    await expect(
      service.create('ws-1', 'wf-1', { name: 'X' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.workflowApiKey.create).not.toHaveBeenCalled();
  });
});

describe('ApiKeysService.list', () => {
  it('nunca expoe keyHash', async () => {
    const { service } = buildService();
    await service.create('ws-1', 'wf-1', { name: 'Producao' });

    const list = await service.list('ws-1', 'wf-1');

    expect(list).toHaveLength(1);
    expect((list[0] as Record<string, unknown>).keyHash).toBeUndefined();
    expect(list[0]?.lastFour).toEqual(expect.any(String));
  });
});

describe('ApiKeysService.revoke', () => {
  it('so revoga chave do proprio fluxo (workflowId no where)', async () => {
    const { service, stored } = buildService();
    const created = await service.create('ws-1', 'wf-1', { name: 'X' });

    await service.revoke('ws-1', 'wf-1', created.id);

    expect(stored[0]?.revokedAt).not.toBeNull();
  });

  it('chave inexistente ou ja revogada: NotFoundException', async () => {
    const { service } = buildService();
    const created = await service.create('ws-1', 'wf-1', { name: 'X' });
    await service.revoke('ws-1', 'wf-1', created.id);

    await expect(service.revoke('ws-1', 'wf-1', created.id)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('ApiKeysService.resolveRawKey', () => {
  it('prefixo errado: null sem consultar o banco', async () => {
    const { service, prisma } = buildService();

    const result = await service.resolveRawKey('token-sem-prefixo');

    expect(result).toBeNull();
    expect(prisma.workflowApiKey.findUnique).not.toHaveBeenCalled();
  });

  it('chave revogada: null', async () => {
    const { service } = buildService();
    const created = await service.create('ws-1', 'wf-1', { name: 'X' });
    await service.revoke('ws-1', 'wf-1', created.id);

    const result = await service.resolveRawKey(created.key);

    expect(result).toBeNull();
  });

  it('chave valida: { id, workflowId }', async () => {
    const { service } = buildService();
    const created = await service.create('ws-1', 'wf-1', { name: 'X' });

    const result = await service.resolveRawKey(created.key);

    expect(result).toEqual({ id: created.id, workflowId: 'wf-1' });
  });
});

describe('ApiKeysService.touchLastUsed', () => {
  it('duas chamadas seguidas: so 1 update (throttle de 60s)', async () => {
    const { service, prisma } = buildService();

    service.touchLastUsed('key-1');
    service.touchLastUsed('key-1');
    await new Promise((resolve) => setImmediate(resolve));

    expect(prisma.workflowApiKey.update).toHaveBeenCalledTimes(1);
  });

  it('rejeicao do update nao propaga (sem isso, unhandled rejection derruba o processo)', async () => {
    const { service, prisma } = buildService();
    (prisma.workflowApiKey.update as jest.Mock).mockRejectedValueOnce(
      new Error('conexao caiu'),
    );

    expect(() => service.touchLastUsed(`key-${Math.random()}`)).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
  });
});
