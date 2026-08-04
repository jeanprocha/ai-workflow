import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CredentialsService } from './credentials.service';

function buildService(opts: {
  findFirstImpl?: jest.Mock;
  decryptImpl?: jest.Mock;
}) {
  const prisma = {
    credential: {
      findFirst: opts.findFirstImpl ?? jest.fn().mockResolvedValue(null),
    },
  };
  const crypto = {
    decrypt: opts.decryptImpl ?? jest.fn().mockReturnValue('valor-decifrado'),
  };
  const service = new CredentialsService(prisma as never, crypto as never);
  return { service, prisma, crypto };
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
