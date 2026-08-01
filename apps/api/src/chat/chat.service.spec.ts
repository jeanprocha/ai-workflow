import { NotFoundException } from '@nestjs/common';
import { ChatService } from './chat.service';

function buildService(workflowByChatToken: Record<string, unknown> | null) {
  const prisma = {
    workflow: {
      findUnique: jest.fn().mockResolvedValue(workflowByChatToken),
    },
    conversation: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    conversationMessage: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const executions = { triggerChat: jest.fn().mockResolvedValue({ id: 'exec-1' }) };
  const service = new ChatService(prisma as never, executions as never);
  return { service, prisma, executions };
}

const ARCHIVED_WORKFLOW = {
  id: 'wf-1',
  status: 'archived',
  currentVersionId: 'ver-1',
  currentVersion: { graph: { nodes: [] } },
};

const DRAFT_WORKFLOW = {
  id: 'wf-1',
  status: 'draft',
  currentVersionId: 'ver-1',
  currentVersion: { graph: { nodes: [] } },
};

describe('ChatService — gate de fluxo arquivado (visitante)', () => {
  it('createConversation: 404 quando o workflow esta archived, sem criar conversa', async () => {
    const { service, prisma } = buildService(ARCHIVED_WORKFLOW);

    await expect(service.createConversation('chat-tok')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  it('postVisitorMessage: 404 quando o workflow esta archived, sem disparar execucao', async () => {
    const { service, executions } = buildService(ARCHIVED_WORKFLOW);

    await expect(
      service.postVisitorMessage('chat-tok', 'conv-1', 'oi'),
    ).rejects.toThrow('Link de chat invalido ou expirado.');
    expect(executions.triggerChat).not.toHaveBeenCalled();
  });

  it('listMessages: 404 quando o workflow esta archived (nao so escrita — leitura tambem gateia)', async () => {
    const { service } = buildService(ARCHIVED_WORKFLOW);

    await expect(
      service.listMessages('chat-tok', 'conv-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('createConversation: funciona normalmente com workflow em draft', async () => {
    const { service, prisma } = buildService(DRAFT_WORKFLOW);
    prisma.conversation.create.mockResolvedValue({ id: 'conv-1' });

    const result = await service.createConversation('chat-tok');

    expect(result.conversationId).toBe('conv-1');
    expect(prisma.conversation.create).toHaveBeenCalledTimes(1);
  });
});

describe('ChatService — inbox (operador) nao gateia por archived', () => {
  it('listConversations: continua funcionando com workflow archived', async () => {
    const prisma = {
      workflow: {
        findUnique: jest.fn().mockResolvedValue(ARCHIVED_WORKFLOW),
      },
      conversation: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'conv-1',
            status: 'open',
            channel: 'web',
            createdAt: new Date(),
            updatedAt: new Date(),
            messages: [],
          },
        ]),
      },
    };
    const executions = { triggerChat: jest.fn() };
    const service = new ChatService(prisma as never, executions as never);

    const result = await service.listConversations('inbox-tok');

    expect(result).toHaveLength(1);
  });
});
