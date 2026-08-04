import { ConflictException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { OAuthService } from './oauth.service';

const TEST_AUTHORIZE_URL = 'https://fake-provider.local/authorize';
const TEST_TOKEN_URL = 'https://fake-provider.local/token';

function buildService(opts: {
  findUniqueCredentialImpl?: jest.Mock;
  findUniqueStateImpl?: jest.Mock;
  decryptImpl?: jest.Mock;
}) {
  const prisma = {
    oAuthState: {
      create: jest.fn().mockResolvedValue(undefined),
      findUnique: opts.findUniqueStateImpl ?? jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(undefined),
    },
    credential: {
      findUnique:
        opts.findUniqueCredentialImpl ?? jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue(undefined),
    },
  };
  const crypto = {
    encrypt: jest.fn((value: string) => `enc(${value})`),
    decrypt: opts.decryptImpl ?? jest.fn((value: string) => value),
  };
  const service = new OAuthService(prisma as never, crypto as never);
  return { service, prisma, crypto };
}

describe('OAuthService', () => {
  const originalEnv = { ...process.env };
  let fetchMock: jest.Mock;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.OAUTH_TEST_AUTHORIZE_URL = TEST_AUTHORIZE_URL;
    process.env.OAUTH_TEST_TOKEN_URL = TEST_TOKEN_URL;
    process.env.OAUTH_TEST_CLIENT_ID = 'client-id-teste';
    process.env.OAUTH_TEST_CLIENT_SECRET = 'client-secret-teste';
    process.env.WEB_URL = 'https://web.exemplo.com';
    process.env.API_PUBLIC_URL = 'https://api.exemplo.com';
    delete process.env.NODE_ENV;
    fetchMock = jest.fn();
    global.fetch = fetchMock as never;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  describe('start', () => {
    it('provedor nao habilitado: NotFoundException', async () => {
      const { service } = buildService({});

      await expect(
        service.start('ws-1', 'user-1', 'provedor-inexistente'),
      ).rejects.toThrow(NotFoundException);
    });

    it('nome ja usado por credencial de outro kind/provider: ConflictException, sem criar state', async () => {
      const findUniqueCredentialImpl = jest.fn().mockResolvedValue({
        kind: 'secret',
        oauthProvider: null,
      });
      const { service, prisma } = buildService({ findUniqueCredentialImpl });

      await expect(
        service.start('ws-1', 'user-1', '_test', '_test'),
      ).rejects.toThrow(ConflictException);
      expect(prisma.oAuthState.create).not.toHaveBeenCalled();
    });

    it('nome ja usado pela MESMA credencial oauth/provider (reconexao): permitido', async () => {
      const findUniqueCredentialImpl = jest.fn().mockResolvedValue({
        kind: 'oauth',
        oauthProvider: '_test',
      });
      const { service, prisma } = buildService({ findUniqueCredentialImpl });

      const result = await service.start('ws-1', 'user-1', '_test', '_test');

      expect(result.authorizeUrl).toContain(TEST_AUTHORIZE_URL);
      expect(prisma.oAuthState.create).toHaveBeenCalledTimes(1);
    });

    it('cria o state com workspaceId/userId/provider/credentialName e TTL futuro', async () => {
      const { service, prisma } = buildService({});

      await service.start('ws-1', 'user-1', '_test', 'minha-conexao');

      const call = prisma.oAuthState.create.mock.calls[0][0];
      expect(call.data.workspaceId).toBe('ws-1');
      expect(call.data.userId).toBe('user-1');
      expect(call.data.provider).toBe('_test');
      expect(call.data.credentialName).toBe('minha-conexao');
      expect((call.data.expiresAt as Date).getTime()).toBeGreaterThan(
        Date.now(),
      );
      expect(typeof call.data.stateHash).toBe('string');
      expect(call.data.stateHash).toHaveLength(64); // sha256 hex
    });

    it('nome omitido: usa o proprio provider como nome', async () => {
      const { service, prisma } = buildService({});

      await service.start('ws-1', 'user-1', '_test');

      expect(
        prisma.oAuthState.create.mock.calls[0][0].data.credentialName,
      ).toBe('_test');
    });

    it('a URL de autorizacao carrega client_id, redirect_uri, response_type e scope', async () => {
      const { service } = buildService({});

      const { authorizeUrl } = await service.start('ws-1', 'user-1', '_test');
      const url = new URL(authorizeUrl);

      expect(url.searchParams.get('client_id')).toBe('client-id-teste');
      expect(url.searchParams.get('redirect_uri')).toBe(
        'https://api.exemplo.com/oauth/callback',
      );
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('scope')).toBe('test');
      expect(url.searchParams.get('state')).toHaveLength(64); // 32 bytes hex
    });
  });

  describe('handleCallback', () => {
    function validStateRow(overrides: Record<string, unknown> = {}) {
      return {
        id: 'state-1',
        stateHash: 'hash-qualquer',
        workspaceId: 'ws-1',
        userId: 'user-1',
        provider: '_test',
        credentialName: 'minha-conexao',
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        ...overrides,
      };
    }

    it('sem code: redireciona pra erro sem tocar o banco', async () => {
      const { service, prisma } = buildService({});

      const url = await service.handleCallback({ state: 'abc' });

      expect(url).toBe('https://web.exemplo.com/settings?oauth=erro');
      expect(prisma.oAuthState.findUnique).not.toHaveBeenCalled();
    });

    it('sem state: redireciona pra erro', async () => {
      const { service } = buildService({});

      const url = await service.handleCallback({ code: 'abc' });

      expect(url).toBe('https://web.exemplo.com/settings?oauth=erro');
    });

    it('query com error= (usuario negou consentimento): redireciona pra erro', async () => {
      const { service } = buildService({});

      const url = await service.handleCallback({
        error: 'access_denied',
        code: 'abc',
        state: 'xyz',
      });

      expect(url).toBe('https://web.exemplo.com/settings?oauth=erro');
    });

    it('state inexistente: redireciona pra erro', async () => {
      const findUniqueStateImpl = jest.fn().mockResolvedValue(null);
      const { service } = buildService({ findUniqueStateImpl });

      const url = await service.handleCallback({
        code: 'abc',
        state: 'nao-existe',
      });

      expect(url).toBe('https://web.exemplo.com/settings?oauth=erro');
    });

    it('state expirado: redireciona pra erro, nao troca o code', async () => {
      const findUniqueStateImpl = jest
        .fn()
        .mockResolvedValue(
          validStateRow({ expiresAt: new Date(Date.now() - 1000) }),
        );
      const { service } = buildService({ findUniqueStateImpl });

      const url = await service.handleCallback({ code: 'abc', state: 'x' });

      expect(url).toBe('https://web.exemplo.com/settings?oauth=erro');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('state ja usado: redireciona pra erro, nao troca o code (defesa contra replay)', async () => {
      const findUniqueStateImpl = jest
        .fn()
        .mockResolvedValue(validStateRow({ usedAt: new Date() }));
      const { service } = buildService({ findUniqueStateImpl });

      const url = await service.handleCallback({ code: 'abc', state: 'x' });

      expect(url).toBe('https://web.exemplo.com/settings?oauth=erro');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('state valido: marca usedAt ANTES de trocar o code', async () => {
      const findUniqueStateImpl = jest.fn().mockResolvedValue(validStateRow());
      fetchMock.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ access_token: 'tok-1', expires_in: 3600 }),
      });
      const { service, prisma } = buildService({ findUniqueStateImpl });

      await service.handleCallback({ code: 'abc', state: 'x' });

      expect(prisma.oAuthState.update).toHaveBeenCalledWith({
        where: { id: 'state-1' },
        data: { usedAt: expect.any(Date) },
      });
    });

    it('troca de token falha (provider fora do ar): redireciona pra erro, nao cria credencial', async () => {
      const findUniqueStateImpl = jest.fn().mockResolvedValue(validStateRow());
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('erro interno do provider'),
      });
      const { service, prisma } = buildService({ findUniqueStateImpl });

      const url = await service.handleCallback({ code: 'abc', state: 'x' });

      expect(url).toBe(
        'https://web.exemplo.com/settings?oauth=erro&provider=_test',
      );
      expect(prisma.credential.upsert).not.toHaveBeenCalled();
    });

    it('sucesso: cria a credencial oauth com kind, expiracao e status active', async () => {
      const findUniqueStateImpl = jest.fn().mockResolvedValue(validStateRow());
      fetchMock.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'tok-1',
            refresh_token: 'refresh-1',
            expires_in: 3600,
            token_type: 'Bearer',
            scope: 'openid email',
          }),
      });
      const { service, prisma } = buildService({ findUniqueStateImpl });

      const url = await service.handleCallback({ code: 'abc', state: 'x' });

      expect(url).toBe(
        'https://web.exemplo.com/settings?oauth=ok&provider=_test',
      );
      const call = prisma.credential.upsert.mock.calls[0][0];
      expect(call.where).toEqual({
        workspaceId_name: { workspaceId: 'ws-1', name: 'minha-conexao' },
      });
      expect(call.create.kind).toBe('oauth');
      expect(call.create.oauthStatus).toBe('active');
      expect(call.create.oauthScopes).toEqual(['openid', 'email']);
      expect((call.create.oauthExpiresAt as Date).getTime()).toBeGreaterThan(
        Date.now(),
      );
      expect(call.create.encryptedData).toContain('tok-1');
      expect(call.create.encryptedData).toContain('refresh-1');
    });

    it('reconexao sem refresh_token novo na resposta: preserva o refresh_token anterior', async () => {
      const findUniqueStateImpl = jest.fn().mockResolvedValue(validStateRow());
      const findUniqueCredentialImpl = jest.fn().mockResolvedValue({
        encryptedData: JSON.stringify({
          access_token: 'tok-velho',
          refresh_token: 'refresh-original',
          token_type: 'Bearer',
        }),
      });
      fetchMock.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ access_token: 'tok-novo', expires_in: 3600 }),
      });
      const { service, prisma } = buildService({
        findUniqueStateImpl,
        findUniqueCredentialImpl,
      });

      await service.handleCallback({ code: 'abc', state: 'x' });

      const call = prisma.credential.upsert.mock.calls[0][0];
      expect(call.update.encryptedData).toContain('refresh-original');
      expect(call.update.encryptedData).toContain('tok-novo');
    });

    it('params extras do Google (authuser, prompt) na query nao quebram o callback', async () => {
      const findUniqueStateImpl = jest.fn().mockResolvedValue(validStateRow());
      fetchMock.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ access_token: 'tok-1', expires_in: 3600 }),
      });
      const { service } = buildService({ findUniqueStateImpl });

      const url = await service.handleCallback({
        code: 'abc',
        state: 'x',
        scope: 'openid email',
        authuser: '0',
        prompt: 'consent',
        hd: 'exemplo.com',
      });

      expect(url).toBe(
        'https://web.exemplo.com/settings?oauth=ok&provider=_test',
      );
    });
  });

  it('sha256(state bruto) e o que vai no lookup — nunca o valor bruto', async () => {
    const findUniqueStateImpl = jest.fn().mockResolvedValue(null);
    const { service, prisma } = buildService({ findUniqueStateImpl });

    await service.handleCallback({
      code: 'abc',
      state: 'valor-bruto-do-state',
    });

    const expectedHash = createHash('sha256')
      .update('valor-bruto-do-state')
      .digest('hex');
    expect(prisma.oAuthState.findUnique).toHaveBeenCalledWith({
      where: { stateHash: expectedHash },
    });
  });
});
