import { HttpException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { FlowApiKeyGuard } from './flow-api-key.guard';
import type { ApiKeysService } from '../api-keys.service';
import { isFlowApiRateLimited } from '../flow-api-rate-limit';

// Mockado pra controlar o branch de 429 sem depender do contador real
// (Map em memoria no modulo, compartilhado entre todos os testes do processo).
jest.mock('../flow-api-rate-limit', () => ({
  isFlowApiRateLimited: jest.fn().mockReturnValue(false),
}));

function buildGuard(
  overrides: {
    resolveRawKey?: jest.Mock;
    touchLastUsed?: jest.Mock;
  } = {},
) {
  const apiKeys = {
    resolveRawKey: overrides.resolveRawKey ?? jest.fn().mockResolvedValue(null),
    touchLastUsed: overrides.touchLastUsed ?? jest.fn(),
  };
  const guard = new FlowApiKeyGuard(apiKeys as unknown as ApiKeysService);
  return { guard, apiKeys };
}

function buildContext(
  headers: Record<string, string>,
  params: Record<string, string>,
) {
  const request: Record<string, unknown> = { headers, params };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('FlowApiKeyGuard', () => {
  afterEach(() => {
    (isFlowApiRateLimited as jest.Mock).mockReturnValue(false);
  });

  it('sem header Authorization: UnauthorizedException', async () => {
    const { guard } = buildGuard();
    const { context } = buildContext({}, { workflowId: 'wf-1' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('header sem "Bearer ": UnauthorizedException', async () => {
    const { guard } = buildGuard();
    const { context } = buildContext(
      { authorization: 'Basic algumacoisa' },
      { workflowId: 'wf-1' },
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('chave nao resolvida (inexistente/revogada/prefixo errado): mesma mensagem do caso ausente', async () => {
    const resolveRawKey = jest.fn().mockResolvedValue(null);
    const { guard } = buildGuard({ resolveRawKey });
    const { context } = buildContext(
      { authorization: 'Bearer wfk_lixo' },
      { workflowId: 'wf-1' },
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      'Chave de API invalida ou revogada.',
    );
  });

  it('chave valida mas de OUTRO fluxo: UnauthorizedException, request.flowApiKey fica undefined', async () => {
    const resolveRawKey = jest
      .fn()
      .mockResolvedValue({ id: 'key-1', workflowId: 'wf-OUTRO' });
    const { guard } = buildGuard({ resolveRawKey });
    const { context, request } = buildContext(
      { authorization: 'Bearer wfk_valida' },
      { workflowId: 'wf-1' },
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(request.flowApiKey).toBeUndefined();
  });

  it('chave valida do proprio fluxo: true, request.flowApiKey populado, touchLastUsed chamado', async () => {
    const resolveRawKey = jest
      .fn()
      .mockResolvedValue({ id: 'key-1', workflowId: 'wf-1' });
    const touchLastUsed = jest.fn();
    const { guard } = buildGuard({ resolveRawKey, touchLastUsed });
    const { context, request } = buildContext(
      { authorization: 'Bearer wfk_valida' },
      { workflowId: 'wf-1' },
    );

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.flowApiKey).toEqual({ id: 'key-1', workflowId: 'wf-1' });
    expect(touchLastUsed).toHaveBeenCalledWith('key-1');
  });

  it('rate limit estourado: HttpException 429, request.flowApiKey nunca populado', async () => {
    (isFlowApiRateLimited as jest.Mock).mockReturnValue(true);
    const resolveRawKey = jest
      .fn()
      .mockResolvedValue({ id: 'key-1', workflowId: 'wf-1' });
    const touchLastUsed = jest.fn();
    const { guard } = buildGuard({ resolveRawKey, touchLastUsed });
    const { context, request } = buildContext(
      { authorization: 'Bearer wfk_valida' },
      { workflowId: 'wf-1' },
    );

    let caught: unknown;
    try {
      await guard.canActivate(context);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(HttpException);
    expect((caught as HttpException).getStatus()).toBe(429);
    expect(request.flowApiKey).toBeUndefined();
    expect(touchLastUsed).not.toHaveBeenCalled();
  });
});
