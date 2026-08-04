import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CredentialsService } from './credentials.service';
import { OAuthInvalidGrantError } from '../oauth/token-exchange';

const exchangeRefreshTokenMock = jest.fn<Promise<unknown>, unknown[]>();
jest.mock('../oauth/token-exchange', () => {
  const actual = jest.requireActual<typeof import('../oauth/token-exchange')>(
    '../oauth/token-exchange',
  );
  return {
    OAuthInvalidGrantError: actual.OAuthInvalidGrantError,
    exchangeRefreshToken: (...args: unknown[]) =>
      exchangeRefreshTokenMock(...args),
  };
});

const getOAuthProviderMock = jest.fn<unknown, unknown[]>();
jest.mock('../oauth/providers', () => ({
  getOAuthProvider: (...args: unknown[]) => getOAuthProviderMock(...args),
}));

function buildService(opts: {
  findFirstImpl?: jest.Mock;
  findUniqueImpl?: jest.Mock;
  updateImpl?: jest.Mock;
  decryptImpl?: jest.Mock;
  encryptImpl?: jest.Mock;
  acquireLockImpl?: jest.Mock;
  releaseLockImpl?: jest.Mock;
}) {
  const prisma = {
    credential: {
      findFirst: opts.findFirstImpl ?? jest.fn().mockResolvedValue(null),
      findUnique: opts.findUniqueImpl ?? jest.fn().mockResolvedValue(null),
      update: opts.updateImpl ?? jest.fn().mockResolvedValue(undefined),
    },
  };
  const crypto = {
    decrypt: opts.decryptImpl ?? jest.fn().mockReturnValue('valor-decifrado'),
    encrypt: opts.encryptImpl ?? jest.fn((value: string) => `enc(${value})`),
  };
  const cache = {
    acquireLock:
      opts.acquireLockImpl ?? jest.fn().mockResolvedValue('lock-token'),
    releaseLock: opts.releaseLockImpl ?? jest.fn().mockResolvedValue(undefined),
  };
  const service = new CredentialsService(
    prisma as never,
    crypto as never,
    cache as never,
  );
  return { service, prisma, crypto, cache };
}

describe('CredentialsService.resolve', () => {
  it('acha a credencial por workspaceId+name e devolve o valor decifrado', async () => {
    const findFirstImpl = jest.fn().mockResolvedValue({
      encryptedData: 'iv.tag.data',
    });
    const decryptImpl = jest.fn().mockReturnValue('segredo-em-claro');
    const { service, prisma, crypto } = buildService({
      findFirstImpl,
      decryptImpl,
    });

    const value = await service.resolve('ws-1', 'minha-credencial');

    expect(value).toBe('segredo-em-claro');
    expect(prisma.credential.findFirst).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1', name: 'minha-credencial' },
    });
    expect(crypto.decrypt).toHaveBeenCalledWith('iv.tag.data');
  });

  it('sem opts e credencial ausente: lanca NotFoundException com a mensagem padrao (molde engine/agents/tools)', async () => {
    const { service } = buildService({});

    await expect(service.resolve('ws-1', 'fantasma')).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.resolve('ws-1', 'fantasma')).rejects.toThrow(
      'Credencial "fantasma" nao encontrada neste workspace.',
    );
  });

  it('sem opts e nome vazio: nao ha guarda — cai direto no NotFoundException (molde agents.service.ts)', async () => {
    const { service, prisma } = buildService({});

    await expect(service.resolve('ws-1', '')).rejects.toThrow(
      'Credencial "" nao encontrada neste workspace.',
    );
    expect(prisma.credential.findFirst).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1', name: '' },
    });
  });

  it('com emptyNameMessage e nome vazio: lanca BadRequestException com a mensagem informada, sem consultar o banco', async () => {
    const { service, prisma } = buildService({});

    await expect(
      service.resolve('ws-1', '', {
        emptyNameMessage: 'Informe a credencial do provider de IA.',
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.resolve('ws-1', '', {
        emptyNameMessage: 'Informe a credencial do provider de IA.',
      }),
    ).rejects.toThrow('Informe a credencial do provider de IA.');
    expect(prisma.credential.findFirst).not.toHaveBeenCalled();
  });

  it('com emptyNameMessage diferente (molde knowledge.service.ts) e nome nao-vazio: guarda nao dispara', async () => {
    const findFirstImpl = jest.fn().mockResolvedValue({
      encryptedData: 'iv.tag.data',
    });
    const { service, prisma } = buildService({ findFirstImpl });

    await service.resolve('ws-1', 'openai-embeddings', {
      emptyNameMessage:
        'Configure a credencial do provider de embeddings na base de conhecimento.',
    });

    expect(prisma.credential.findFirst).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1', name: 'openai-embeddings' },
    });
  });

  it('devolve sempre string opaca — nunca faz parse do valor decifrado', async () => {
    const decryptImpl = jest
      .fn()
      .mockReturnValue('{"host":"127.0.0.1","port":1025}');
    const { service } = buildService({
      findFirstImpl: jest
        .fn()
        .mockResolvedValue({ encryptedData: 'iv.tag.data' }),
      decryptImpl,
    });

    const value = await service.resolve('ws-1', 'smtp');

    expect(typeof value).toBe('string');
    expect(value).toBe('{"host":"127.0.0.1","port":1025}');
  });
});

describe('CredentialsService.resolve — kind oauth', () => {
  const OAUTH_BLOB = JSON.stringify({
    access_token: 'access-velho',
    refresh_token: 'refresh-1',
    token_type: 'Bearer',
  });

  beforeEach(() => {
    exchangeRefreshTokenMock.mockReset();
    getOAuthProviderMock.mockReset();
    getOAuthProviderMock.mockReturnValue({
      authorizeUrl: 'https://provider.local/authorize',
      tokenUrl: 'https://provider.local/token',
      defaultScopes: ['scope-a'],
      clientId: 'client-id',
      clientSecret: 'client-secret',
    });
  });

  function oauthCredential(overrides: Record<string, unknown> = {}) {
    return {
      id: 'cred-1',
      kind: 'oauth',
      encryptedData: OAUTH_BLOB,
      oauthProvider: 'google',
      oauthExpiresAt: new Date(Date.now() + 3_600_000),
      oauthStatus: 'active',
      oauthLastError: null,
      ...overrides,
    };
  }

  it('expiracao distante: devolve o access_token direto, sem lock nem chamada de rede', async () => {
    const findFirstImpl = jest.fn().mockResolvedValue(oauthCredential());
    const decryptImpl = jest.fn((value: string) => value);
    const { service, cache } = buildService({ findFirstImpl, decryptImpl });

    const value = await service.resolve('ws-1', 'google');

    expect(value).toBe('access-velho');
    expect(cache.acquireLock).not.toHaveBeenCalled();
    expect(exchangeRefreshTokenMock).not.toHaveBeenCalled();
  });

  it('sem oauthExpiresAt (null): nunca precisa renovar', async () => {
    const findFirstImpl = jest
      .fn()
      .mockResolvedValue(oauthCredential({ oauthExpiresAt: null }));
    const decryptImpl = jest.fn((value: string) => value);
    const { service } = buildService({ findFirstImpl, decryptImpl });

    const value = await service.resolve('ws-1', 'google');

    expect(value).toBe('access-velho');
    expect(exchangeRefreshTokenMock).not.toHaveBeenCalled();
  });

  it('perto de expirar: adquire o lock, renova, grava a credencial e libera o lock', async () => {
    const findFirstImpl = jest
      .fn()
      .mockResolvedValue(
        oauthCredential({ oauthExpiresAt: new Date(Date.now() + 1000) }),
      );
    const decryptImpl = jest.fn((value: string) => value);
    const updateImpl = jest.fn().mockResolvedValue(undefined);
    exchangeRefreshTokenMock.mockResolvedValue({
      access_token: 'access-novo',
      refresh_token: 'refresh-novo',
      expires_in: 3600,
      token_type: 'Bearer',
    });
    const { service, prisma, cache } = buildService({
      findFirstImpl,
      decryptImpl,
      updateImpl,
    });

    const value = await service.resolve('ws-1', 'google');

    expect(value).toBe('access-novo');
    expect(cache.acquireLock).toHaveBeenCalledWith('oauth-refresh:cred-1', 15);
    expect(exchangeRefreshTokenMock).toHaveBeenCalledWith(
      expect.objectContaining({ tokenUrl: 'https://provider.local/token' }),
      'refresh-1',
    );
    const call = prisma.credential.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'cred-1' });
    expect(call.data.oauthStatus).toBe('active');
    expect(call.data.oauthLastError).toBeNull();
    expect(call.data.encryptedData).toContain('access-novo');
    expect(call.data.encryptedData).toContain('refresh-novo');
    expect(cache.releaseLock).toHaveBeenCalledWith(
      'oauth-refresh:cred-1',
      'lock-token',
    );
  });

  it('renovacao sem refresh_token novo na resposta: preserva o refresh_token anterior', async () => {
    const findFirstImpl = jest
      .fn()
      .mockResolvedValue(
        oauthCredential({ oauthExpiresAt: new Date(Date.now() + 1000) }),
      );
    const decryptImpl = jest.fn((value: string) => value);
    exchangeRefreshTokenMock.mockResolvedValue({
      access_token: 'access-novo',
      expires_in: 3600,
    });
    const { service, prisma } = buildService({ findFirstImpl, decryptImpl });

    await service.resolve('ws-1', 'google');

    const call = prisma.credential.update.mock.calls[0][0];
    expect(call.data.encryptedData).toContain('refresh-1');
  });

  it('invalid_grant: marca oauthStatus error, grava oauthLastError e lanca BadRequestException', async () => {
    const findFirstImpl = jest
      .fn()
      .mockResolvedValue(
        oauthCredential({ oauthExpiresAt: new Date(Date.now() + 1000) }),
      );
    const decryptImpl = jest.fn((value: string) => value);
    const updateImpl = jest.fn().mockResolvedValue(undefined);
    exchangeRefreshTokenMock.mockRejectedValue(
      new OAuthInvalidGrantError('refresh token revogado'),
    );
    const { service, prisma } = buildService({
      findFirstImpl,
      decryptImpl,
      updateImpl,
    });

    await expect(service.resolve('ws-1', 'google')).rejects.toThrow(
      BadRequestException,
    );

    const call = prisma.credential.update.mock.calls[0][0];
    expect(call.data.oauthStatus).toBe('error');
    expect(call.data.oauthLastError).toBe('refresh token revogado');
  });

  it('falha transitoria (rede/timeout): propaga o erro original, sem marcar a credencial como erro', async () => {
    const findFirstImpl = jest
      .fn()
      .mockResolvedValue(
        oauthCredential({ oauthExpiresAt: new Date(Date.now() + 1000) }),
      );
    const decryptImpl = jest.fn((value: string) => value);
    const updateImpl = jest.fn().mockResolvedValue(undefined);
    exchangeRefreshTokenMock.mockRejectedValue(new Error('fetch failed'));
    const { service, prisma } = buildService({
      findFirstImpl,
      decryptImpl,
      updateImpl,
    });

    await expect(service.resolve('ws-1', 'google')).rejects.toThrow(
      'fetch failed',
    );
    expect(prisma.credential.update).not.toHaveBeenCalled();
  });

  it('sem refresh_token no blob: BadRequestException pedindo reconexao, sem chamar a rede', async () => {
    const findFirstImpl = jest.fn().mockResolvedValue(
      oauthCredential({
        encryptedData: JSON.stringify({
          access_token: 'x',
          refresh_token: null,
          token_type: 'Bearer',
        }),
        oauthExpiresAt: new Date(Date.now() + 1000),
      }),
    );
    const decryptImpl = jest.fn((value: string) => value);
    const { service } = buildService({ findFirstImpl, decryptImpl });

    await expect(service.resolve('ws-1', 'google')).rejects.toThrow(
      BadRequestException,
    );
    expect(exchangeRefreshTokenMock).not.toHaveBeenCalled();
  });

  it('provedor nao habilitado mais: BadRequestException, sem chamar a rede', async () => {
    getOAuthProviderMock.mockReturnValue(null);
    const findFirstImpl = jest
      .fn()
      .mockResolvedValue(
        oauthCredential({ oauthExpiresAt: new Date(Date.now() + 1000) }),
      );
    const decryptImpl = jest.fn((value: string) => value);
    const { service } = buildService({ findFirstImpl, decryptImpl });

    await expect(service.resolve('ws-1', 'google')).rejects.toThrow(
      BadRequestException,
    );
    expect(exchangeRefreshTokenMock).not.toHaveBeenCalled();
  });

  describe('lock nao adquirido (outro processo ja esta renovando)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('rele o banco e devolve o token que o dono do lock ja renovou', async () => {
      const findFirstImpl = jest
        .fn()
        .mockResolvedValue(
          oauthCredential({ oauthExpiresAt: new Date(Date.now() + 1000) }),
        );
      const decryptImpl = jest.fn((value: string) => value);
      const findUniqueImpl = jest
        .fn()
        .mockResolvedValueOnce(
          oauthCredential({ oauthExpiresAt: new Date(Date.now() + 1000) }),
        )
        .mockResolvedValueOnce(
          oauthCredential({
            encryptedData: JSON.stringify({
              access_token: 'access-do-outro-processo',
              refresh_token: 'refresh-1',
              token_type: 'Bearer',
            }),
            oauthExpiresAt: new Date(Date.now() + 3_600_000),
          }),
        );
      const { service, cache } = buildService({
        findFirstImpl,
        decryptImpl,
        findUniqueImpl,
        acquireLockImpl: jest.fn().mockResolvedValue(null),
      });

      const promise = service.resolve('ws-1', 'google');
      await jest.advanceTimersByTimeAsync(500);
      const value = await promise;

      expect(value).toBe('access-do-outro-processo');
      expect(exchangeRefreshTokenMock).not.toHaveBeenCalled();
      expect(cache.releaseLock).not.toHaveBeenCalled();
    });

    it('outro processo marcou erro durante a espera: lanca BadRequestException com oauthLastError', async () => {
      const findFirstImpl = jest
        .fn()
        .mockResolvedValue(
          oauthCredential({ oauthExpiresAt: new Date(Date.now() + 1000) }),
        );
      const decryptImpl = jest.fn((value: string) => value);
      const findUniqueImpl = jest.fn().mockResolvedValue(
        oauthCredential({
          oauthStatus: 'error',
          oauthLastError: 'refresh token revogado pelo provedor',
        }),
      );
      const { service } = buildService({
        findFirstImpl,
        decryptImpl,
        findUniqueImpl,
        acquireLockImpl: jest.fn().mockResolvedValue(null),
      });

      const promise = service.resolve('ws-1', 'google');
      // Anexa o handler de rejeicao ANTES de avancar os timers — a excecao
      // e lancada durante o proprio advanceTimersByTimeAsync, e sem isso o
      // Node reporta unhandled rejection antes do expect() rodar.
      const assertion = expect(promise).rejects.toThrow(
        'refresh token revogado pelo provedor',
      );
      await jest.advanceTimersByTimeAsync(500);
      await assertion;
    });

    it('janela de espera esgota sem resolucao: tenta renovar tambem (fallback, nao e Redlock)', async () => {
      const findFirstImpl = jest
        .fn()
        .mockResolvedValue(
          oauthCredential({ oauthExpiresAt: new Date(Date.now() + 1000) }),
        );
      const decryptImpl = jest.fn((value: string) => value);
      const findUniqueImpl = jest
        .fn()
        .mockResolvedValue(
          oauthCredential({ oauthExpiresAt: new Date(Date.now() + 1000) }),
        );
      exchangeRefreshTokenMock.mockResolvedValue({
        access_token: 'access-do-fallback',
        expires_in: 3600,
      });
      const { service } = buildService({
        findFirstImpl,
        decryptImpl,
        findUniqueImpl,
        acquireLockImpl: jest.fn().mockResolvedValue(null),
      });

      const promise = service.resolve('ws-1', 'google');
      await jest.advanceTimersByTimeAsync(5_000);
      const value = await promise;

      expect(value).toBe('access-do-fallback');
      expect(exchangeRefreshTokenMock).toHaveBeenCalledTimes(1);
    });
  });
});
