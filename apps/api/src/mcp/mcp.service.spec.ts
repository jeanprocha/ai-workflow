import { Prisma } from '@prisma/client';
import { CryptoService } from '../crypto/crypto.service';
import { McpService } from './mcp.service';

// jest.fn() sem tipo devolve `any`, e o factory do jest.mock abaixo viraria um
// `no-unsafe-return` por chamada.
const connectMcpServerMock = jest.fn<Promise<unknown>, unknown[]>();
const listMcpToolsMock = jest.fn<Promise<unknown>, unknown[]>();
const callMcpToolMock = jest.fn<Promise<unknown>, unknown[]>();

jest.mock('@workflow/ai', () => ({
  connectMcpServer: (...args: unknown[]) => connectMcpServerMock(...args),
  listMcpTools: (...args: unknown[]) => listMcpToolsMock(...args),
  callMcpTool: (...args: unknown[]) => callMcpToolMock(...args),
}));

process.env.SECRETS_ENCRYPTION_KEY = 'chave-de-teste-do-mcp-service';
/** Mesma instancia que o service recebe — permite montar ciphertext nos fixtures. */
const cipher = new CryptoService();

const SERVER_BASE = {
  id: 'srv-1',
  workspaceId: 'ws-1',
  name: 'GitHub',
  transport: 'stdio' as 'stdio' | 'sse' | 'http',
  command: 'npx' as string | null,
  args: ['-y', '@modelcontextprotocol/server-github'] as string[] | null,
  url: null as string | null,
  status: 'connected' as 'connecting' | 'connected' | 'disconnected' | 'error',
  lastError: null as string | null,
  lastCheckedAt: null as Date | null,
  createdAt: new Date('2026-08-02T00:00:00Z'),
  envEncrypted: null as string | null,
  headersEncrypted: null as string | null,
  env: null as Record<string, string> | null,
  headers: null as Record<string, string> | null,
  tools: [] as Array<{ name: string }>,
};

type ServerRow = typeof SERVER_BASE & Record<string, unknown>;

/**
 * Grava uma coluna Json como o Postgres gravaria: `Prisma.DbNull` vira NULL de
 * verdade na coluna, `Prisma.JsonNull` vira o literal `null` em jsonb — que
 * NAO e NULL. A diferenca e o que faz o backfill ser idempotente ou re-rodar
 * eternamente, entao o mock precisa distinguir os dois.
 */
function applyJsonWrite(value: unknown): unknown {
  return value === Prisma.DbNull ? null : value;
}

/**
 * Filtro `{ not: <sentinela> }` de coluna Json, com a semantica do Prisma:
 *
 * - `not: Prisma.DbNull` → `coluna IS NOT NULL`;
 * - `not: Prisma.JsonNull` → `coluna <> 'null'::jsonb`, que em SQL tambem
 *   exclui as linhas NULL (NULL <> x e desconhecido);
 * - `null` cru → o Prisma recusa em coluna Json nullable e manda usar um dos
 *   sentinelas; o mock recusa igual, senao a troca passaria despercebida.
 */
function matchesJsonNot(value: unknown, target: unknown): boolean {
  if (target === Prisma.DbNull) return value !== null;
  if (target === Prisma.JsonNull) {
    return value !== null && value !== Prisma.JsonNull;
  }
  throw new Error(
    'Filtro Json exige Prisma.DbNull ou Prisma.JsonNull — `null` cru nao e aceito pelo Prisma.',
  );
}

/**
 * Aplica o `where` de verdade em vez de devolver o store inteiro. Sem isso o
 * filtro de idempotencia do backfill nao seria exercido por teste nenhum:
 * trocar `Prisma.DbNull` por `Prisma.JsonNull` (ou por `null` cru) manteria a
 * suite verde e, em producao, o backfill re-migraria as mesmas linhas a cada
 * boot.
 */
function matchesWhere(
  row: ServerRow,
  where: Record<string, unknown> = {},
): boolean {
  return Object.entries(where).every(([field, condition]) => {
    if (field === 'OR') {
      return (condition as Array<Record<string, unknown>>).some((clause) =>
        matchesWhere(row, clause),
      );
    }
    if (condition !== null && typeof condition === 'object') {
      if (!('not' in condition)) {
        throw new Error(
          `Operador nao suportado no mock: ${JSON.stringify(condition)}`,
        );
      }
      return matchesJsonNot(row[field], condition.not);
    }
    return row[field] === condition;
  });
}

function buildService(rows: Array<Partial<ServerRow>> = []) {
  const store = rows.map((row) => ({ ...SERVER_BASE, ...row }));

  const prisma = {
    mcpServer: {
      findMany: jest
        .fn()
        .mockImplementation(
          ({ where }: { where?: Record<string, unknown> } = {}) =>
            Promise.resolve(store.filter((row) => matchesWhere(row, where))),
        ),
      findFirst: jest
        .fn()
        .mockImplementation(({ where }: { where: { id: string } }) =>
          Promise.resolve(store.find((row) => row.id === where.id) ?? null),
        ),
      findUniqueOrThrow: jest
        .fn()
        .mockImplementation(({ where }: { where: { id: string } }) =>
          Promise.resolve(store.find((row) => row.id === where.id)),
        ),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          const created = { ...SERVER_BASE, ...data } as ServerRow;
          store.push(created);
          return Promise.resolve(created);
        }),
      update: jest
        .fn()
        .mockImplementation(
          ({
            where,
            data,
          }: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => {
            const row = store.find((item) => item.id === where.id);
            if (row) {
              for (const [field, value] of Object.entries(data)) {
                (row as Record<string, unknown>)[field] = applyJsonWrite(value);
              }
            }
            return Promise.resolve(row);
          },
        ),
      delete: jest.fn().mockResolvedValue(undefined),
    },
    mcpTool: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };

  const service = new McpService(prisma as never, cipher);
  return { service, prisma, store };
}

describe('McpService — criptografia de env/headers (ADR-007)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    connectMcpServerMock.mockResolvedValue({
      close: jest.fn().mockResolvedValue(undefined),
      listTools: jest.fn().mockResolvedValue({ tools: [] }),
    });
    listMcpToolsMock.mockResolvedValue([]);
  });

  describe('gravacao', () => {
    it('grava env criptografado e nao escreve nada na coluna em claro', async () => {
      const { service, prisma } = buildService();

      await service.connect('ws-1', {
        name: 'GitHub',
        transport: 'stdio',
        command: 'npx',
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_supersecreto' },
      });

      const data = prisma.mcpServer.create.mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      expect(data.env).toBeUndefined();
      expect(data.envEncrypted).toEqual(expect.any(String));
      expect(data.envEncrypted).not.toContain('ghp_supersecreto');
      expect(JSON.parse(cipher.decrypt(data.envEncrypted as string))).toEqual({
        GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_supersecreto',
      });
    });

    it('grava headers criptografados no transporte http', async () => {
      const { service, prisma } = buildService();

      await service.connect('ws-1', {
        name: 'Remoto',
        transport: 'http',
        url: 'https://mcp.exemplo.com',
        headers: { Authorization: 'Bearer token-123' },
      });

      const data = prisma.mcpServer.create.mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      expect(data.headers).toBeUndefined();
      expect(data.headersEncrypted).not.toContain('token-123');
      expect(
        JSON.parse(cipher.decrypt(data.headersEncrypted as string)),
      ).toEqual({ Authorization: 'Bearer token-123' });
    });

    it('mapa vazio nao vira ciphertext — grava null', async () => {
      const { service, prisma } = buildService();

      await service.connect('ws-1', {
        name: 'Filesystem',
        transport: 'stdio',
        command: 'npx',
        env: {},
      });

      const data = prisma.mcpServer.create.mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      expect(data.envEncrypted).toBeNull();
      expect(data.headersEncrypted).toBeNull();
    });
  });

  describe('leitura pela API', () => {
    it('list nao devolve valor de env/headers, so os nomes das chaves', async () => {
      const { service } = buildService([
        {
          envEncrypted: cipher.encrypt(
            JSON.stringify({ TOKEN: 'ghp_supersecreto', DEBUG: '1' }),
          ),
        },
      ]);

      const [server] = await service.list('ws-1');

      expect(server).not.toHaveProperty('env');
      expect(server).not.toHaveProperty('headers');
      expect(server).not.toHaveProperty('envEncrypted');
      expect(server).not.toHaveProperty('headersEncrypted');
      expect(server.envKeys).toEqual(['TOKEN', 'DEBUG']);
      expect(server.headerKeys).toEqual([]);
      expect(JSON.stringify(server)).not.toContain('ghp_supersecreto');
    });

    it('findOne aplica o mesmo mascaramento', async () => {
      const { service } = buildService([
        {
          headersEncrypted: cipher.encrypt(
            JSON.stringify({ Authorization: 'Bearer token-123' }),
          ),
        },
      ]);

      const server = await service.findOne('ws-1', 'srv-1');

      expect(server).not.toHaveProperty('headersEncrypted');
      expect(server.headerKeys).toEqual(['Authorization']);
      expect(JSON.stringify(server)).not.toContain('token-123');
    });

    it('envKeys sai da coluna legada em claro enquanto o backfill nao passou', async () => {
      const { service } = buildService([
        { env: { TOKEN: 'ghp_legado', DEBUG: '1' } },
      ]);

      const [server] = await service.list('ws-1');

      expect(server.envKeys).toEqual(['TOKEN', 'DEBUG']);
      expect(JSON.stringify(server)).not.toContain('ghp_legado');
    });

    it('segredo ilegivel (chave trocada) nao derruba a listagem', async () => {
      const { service, store } = buildService([{}]);
      store[0].envEncrypted = 'aaa.bbb.ccc';

      const [server] = await service.list('ws-1');

      expect(server.envKeys).toEqual([]);
      expect(server.name).toBe('GitHub');
    });
  });

  describe('uso na conexao', () => {
    it('descriptografa env antes de abrir o transporte stdio', async () => {
      const { service } = buildService([
        {
          envEncrypted: cipher.encrypt(
            JSON.stringify({ TOKEN: 'ghp_supersecreto' }),
          ),
        },
      ]);

      await service.reconnect('ws-1', 'srv-1');

      expect(connectMcpServerMock).toHaveBeenCalledWith({
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { TOKEN: 'ghp_supersecreto' },
      });
    });

    it('descriptografa headers antes de sondar no health check', async () => {
      const { service } = buildService([
        {
          transport: 'http',
          command: null,
          args: null,
          url: 'https://mcp.exemplo.com',
          headersEncrypted: cipher.encrypt(
            JSON.stringify({ Authorization: 'Bearer token-123' }),
          ),
        },
      ]);

      await service.healthCheckAll();

      expect(connectMcpServerMock).toHaveBeenCalledWith({
        transport: 'http',
        url: 'https://mcp.exemplo.com',
        headers: { Authorization: 'Bearer token-123' },
      });
    });

    it('chave trocada vira lastError legivel, nao erro cru do GCM', async () => {
      const { service, store } = buildService([{}]);
      store[0].envEncrypted = 'aaa.bbb.ccc';

      await service.reconnect('ws-1', 'srv-1');

      expect(connectMcpServerMock).not.toHaveBeenCalled();
      expect(store[0].status).toBe('error');
      expect(store[0].lastError).toContain('SECRETS_ENCRYPTION_KEY');
    });
  });

  describe('backfill do que ficou em claro', () => {
    it('criptografa as colunas legadas no boot e zera o texto claro', async () => {
      const { service, prisma } = buildService([
        { env: { TOKEN: 'ghp_legado' } },
      ]);

      await service.onModuleInit();

      const data = prisma.mcpServer.update.mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      expect(JSON.parse(cipher.decrypt(data.envEncrypted as string))).toEqual({
        TOKEN: 'ghp_legado',
      });
      // Prisma.DbNull — objeto sentinela, nao `null` cru.
      expect(data.env).not.toBeNull();
      expect(String(data.env)).toContain('DbNull');
      expect(String(data.headers)).toContain('DbNull');
    });

    it('nao reescreve o ciphertext de quem ja foi migrado', async () => {
      const { service, prisma } = buildService([
        {
          envEncrypted: cipher.encrypt(JSON.stringify({ TOKEN: 'atual' })),
          env: { TOKEN: 'antigo' },
        },
      ]);
      await service.onModuleInit();

      const data = prisma.mcpServer.update.mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      expect(JSON.parse(cipher.decrypt(data.envEncrypted as string))).toEqual({
        TOKEN: 'atual',
      });
    });

    it('falha de uma linha nao impede o boot nem as outras linhas', async () => {
      const { service, prisma } = buildService([
        { id: 'srv-1', env: { A: '1' } },
        { id: 'srv-2', env: { B: '2' } },
      ]);
      prisma.mcpServer.update.mockRejectedValueOnce(new Error('deadlock'));

      await expect(service.onModuleInit()).resolves.toBeUndefined();
      expect(prisma.mcpServer.update).toHaveBeenCalledTimes(2);
    });

    it('criptografa headers legados de um servidor http', async () => {
      const { service, store } = buildService([
        {
          transport: 'http',
          command: null,
          args: null,
          url: 'https://mcp.exemplo.com',
          headers: { Authorization: 'Bearer legado' },
        },
      ]);

      await service.onModuleInit();

      expect(
        JSON.parse(cipher.decrypt(store[0].headersEncrypted as string)),
      ).toEqual({ Authorization: 'Bearer legado' });
      // Mapa vazio nao vira ciphertext, nem no backfill.
      expect(store[0].envEncrypted).toBeNull();
      expect(store[0].headers).toBeNull();
    });

    it('sem linha legada, o filtro nao seleciona nada e nao ha update', async () => {
      const { service, prisma } = buildService([
        { envEncrypted: cipher.encrypt(JSON.stringify({ TOKEN: 'x' })) },
      ]);

      await service.onModuleInit();

      expect(prisma.mcpServer.update).not.toHaveBeenCalled();
    });

    it('linha ja migrada nao e selecionada de novo num segundo boot', async () => {
      const { service, prisma, store } = buildService([
        { env: { TOKEN: 'ghp_legado' } },
      ]);

      await service.onModuleInit();
      await service.onModuleInit();

      // O `Prisma.DbNull` do primeiro boot zerou a coluna legada de verdade;
      // se ele virasse `Prisma.JsonNull`, a linha continuaria casando com o
      // filtro e o backfill re-rodaria a cada boot, pra sempre.
      expect(prisma.mcpServer.update).toHaveBeenCalledTimes(1);
      expect(store[0].env).toBeNull();
      expect(store[0].headers).toBeNull();
    });

    it('enquanto o backfill nao rodou, a conexao ainda usa o valor em claro', async () => {
      const { service } = buildService([{ env: { TOKEN: 'ghp_legado' } }]);

      await service.reconnect('ws-1', 'srv-1');

      expect(connectMcpServerMock).toHaveBeenCalledWith(
        expect.objectContaining({ env: { TOKEN: 'ghp_legado' } }),
      );
    });
  });
});
