import { Injectable, NotFoundException } from '@nestjs/common';
import type { WorkflowGraph } from '@workflow/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionsService } from '../executions/executions.service';

interface ChatTriggerConfig {
  welcomeMessage?: string;
  errorMessage?: string;
}

const HISTORY_LIMIT = 10;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executions: ExecutionsService,
  ) {}

  private async getWorkflowByChatToken(chatToken: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { chatToken },
      include: { currentVersion: true },
    });
    if (!workflow) {
      throw new NotFoundException('Link de chat invalido ou expirado.');
    }
    return workflow;
  }

  private async getWorkflowByInboxToken(inboxToken: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { inboxToken },
      include: { currentVersion: true },
    });
    if (!workflow) {
      throw new NotFoundException('Link de inbox invalido ou expirado.');
    }
    return workflow;
  }

  private async getConversationForWorkflow(
    conversationId: string,
    workflowId: string,
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, workflowId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversa nao encontrada.');
    }
    return conversation;
  }

  private chatConfigOf(
    workflow: Awaited<ReturnType<typeof this.getWorkflowByChatToken>>,
  ): ChatTriggerConfig {
    const graph = workflow.currentVersion?.graph as unknown as
      WorkflowGraph | undefined;
    const chatNode = graph?.nodes.find((node) => node.type === 'trigger.chat');
    return (chatNode?.config as ChatTriggerConfig) ?? {};
  }

  /** Cria a conversa e ja retorna a mensagem de boas-vindas (se configurada), pra evitar um round-trip extra do front. */
  async createConversation(chatToken: string) {
    const workflow = await this.getWorkflowByChatToken(chatToken);
    const { welcomeMessage } = this.chatConfigOf(workflow);

    const conversation = await this.prisma.conversation.create({
      data: { workflowId: workflow.id, channel: 'web' },
    });

    if (welcomeMessage) {
      await this.prisma.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'bot',
          content: welcomeMessage,
        },
      });
    }

    const messages = await this.prisma.conversationMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
    });

    return { conversationId: conversation.id, messages };
  }

  async postVisitorMessage(
    chatToken: string,
    conversationId: string,
    content: string,
  ) {
    const workflow = await this.getWorkflowByChatToken(chatToken);
    const conversation = await this.getConversationForWorkflow(
      conversationId,
      workflow.id,
    );

    // Historico ANTES desta mensagem (o campo `message` do payload ja carrega
    // o conteudo atual) — mesma convencao de ChatAgentDto/CopilotChatDto.
    const history = await this.buildHistory(conversationId);

    await this.prisma.$transaction([
      this.prisma.conversationMessage.create({
        data: { conversationId, role: 'user', content },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      }),
    ]);

    return this.executions.triggerChat(workflow.id, workflow.currentVersionId, {
      message: content,
      conversationId,
      channel: conversation.channel,
      state: conversation.state,
      history,
    });
  }

  async listMessages(chatToken: string, conversationId: string) {
    const workflow = await this.getWorkflowByChatToken(chatToken);
    await this.getConversationForWorkflow(conversationId, workflow.id);
    return this.prisma.conversationMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listConversations(inboxToken: string) {
    const workflow = await this.getWorkflowByInboxToken(inboxToken);
    const conversations = await this.prisma.conversation.findMany({
      where: { workflowId: workflow.id },
      orderBy: { updatedAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    return conversations.map((conversation) => ({
      id: conversation.id,
      status: conversation.status,
      channel: conversation.channel,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      lastMessage: conversation.messages[0] ?? null,
    }));
  }

  async getConversation(inboxToken: string, conversationId: string) {
    const workflow = await this.getWorkflowByInboxToken(inboxToken);
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, workflowId: workflow.id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) {
      throw new NotFoundException('Conversa nao encontrada.');
    }
    return conversation;
  }

  /** Resposta manual do atendente humano — grava a mensagem mas NAO dispara o fluxo. */
  async postOperatorMessage(
    inboxToken: string,
    conversationId: string,
    content: string,
  ) {
    const workflow = await this.getWorkflowByInboxToken(inboxToken);
    await this.getConversationForWorkflow(conversationId, workflow.id);
    await this.prisma.$transaction([
      this.prisma.conversationMessage.create({
        data: { conversationId, role: 'operator', content },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      }),
    ]);
  }

  private async buildHistory(conversationId: string) {
    const rows = await this.prisma.conversationMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
    });
    return rows
      .reverse()
      .map((row) => ({ role: row.role, content: row.content }));
  }
}
