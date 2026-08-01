import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import type { WorkflowGraph } from '@workflow/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { workflowGraphSchema, EMPTY_GRAPH } from './graph.schema';

export function toJsonInput(graph: unknown): Prisma.InputJsonValue {
  return graph as Prisma.InputJsonValue;
}

/**
 * Garante um webhookId estavel para o node trigger.webhook (se houver),
 * gerando um na primeira vez que o node e salvo. Sincronizado com a coluna
 * workflows.webhook_id para permitir lookup O(1) em POST /hooks/:webhookId.
 */
export function ensureWebhookId(graph: WorkflowGraph): {
  graph: WorkflowGraph;
  webhookId: string | null;
} {
  const webhookNode = graph.nodes.find(
    (node) => node.type === 'trigger.webhook',
  );
  if (!webhookNode) return { graph, webhookId: null };

  const existing = webhookNode.config?.webhookId;
  const webhookId =
    typeof existing === 'string' && existing ? existing : randomUUID();

  return {
    webhookId,
    graph: {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === webhookNode.id
          ? { ...node, config: { ...node.config, webhookId } }
          : node,
      ),
    },
  };
}

/**
 * Garante chatToken/inboxToken estaveis para o node trigger.chat (se houver),
 * gerando-os na primeira vez que o node e salvo. Mesmo padrao de
 * ensureWebhookId acima, so que gera DOIS tokens (visitante e operador da
 * inbox) em vez de um.
 */
export function ensureChatTokens(graph: WorkflowGraph): {
  graph: WorkflowGraph;
  chatToken: string | null;
  inboxToken: string | null;
} {
  const chatNode = graph.nodes.find((node) => node.type === 'trigger.chat');
  if (!chatNode) return { graph, chatToken: null, inboxToken: null };

  const existingChatToken = chatNode.config?.chatToken;
  const chatToken =
    typeof existingChatToken === 'string' && existingChatToken
      ? existingChatToken
      : randomUUID();
  const existingInboxToken = chatNode.config?.inboxToken;
  const inboxToken =
    typeof existingInboxToken === 'string' && existingInboxToken
      ? existingInboxToken
      : randomUUID();

  return {
    chatToken,
    inboxToken,
    graph: {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === chatNode.id
          ? { ...node, config: { ...node.config, chatToken, inboxToken } }
          : node,
      ),
    },
  };
}

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerService,
  ) {}

  list(workspaceId: string) {
    return this.prisma.workflow.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async create(workspaceId: string, userId: string, dto: CreateWorkflowDto) {
    return this.prisma.$transaction(async (tx) => {
      const workflow = await tx.workflow.create({
        data: { workspaceId, name: dto.name, description: dto.description },
      });
      const version = await tx.workflowVersion.create({
        data: {
          workflowId: workflow.id,
          versionNumber: 1,
          graph: toJsonInput(EMPTY_GRAPH),
          createdById: userId,
        },
      });
      return tx.workflow.update({
        where: { id: workflow.id },
        data: { currentVersionId: version.id },
        include: { currentVersion: true },
      });
    });
  }

  async findOne(workspaceId: string, id: string) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id, workspaceId },
      include: { currentVersion: true },
    });
    if (!workflow) {
      throw new NotFoundException('Fluxo nao encontrado.');
    }
    return workflow;
  }

  async update(workspaceId: string, id: string, dto: UpdateWorkflowDto) {
    const workflow = await this.findOne(workspaceId, id);

    // H2-05: so valida quando um novo ponteiro NAO-null e enviado — `null`
    // (limpar) e `undefined` (campo nao tocado neste PATCH) nao passam por
    // aqui. `!= null` cobre os dois de proposito (loose equality).
    if (dto.errorWorkflowId != null) {
      if (dto.errorWorkflowId === id) {
        throw new BadRequestException(
          'Um fluxo nao pode ser o proprio fluxo de tratamento de erro.',
        );
      }
      const handler = await this.prisma.workflow.findFirst({
        where: { id: dto.errorWorkflowId, workspaceId },
        select: { id: true },
      });
      if (!handler) {
        throw new NotFoundException(
          'Fluxo de tratamento de erro nao encontrado neste workspace.',
        );
      }
    }

    const updated = await this.prisma.workflow.update({
      where: { id },
      data: dto,
    });

    // O schedule (fila "schedules") so era sincronizado ao salvar o grafo —
    // arquivar ou voltar pra rascunho um fluxo com trigger.cron habilitado
    // NAO cancelava o agendamento, que continuava disparando execucoes pra
    // sempre. Agora o PATCH de status tambem sincroniza: active re-agenda
    // a partir do grafo atual, draft/archived remove.
    if (dto.status === 'active') {
      const graph = workflow.currentVersion?.graph as unknown as
        WorkflowGraph | undefined;
      if (graph) {
        await this.scheduler.syncWorkflowSchedule(id, workspaceId, graph);
      }
    } else if (dto.status === 'draft' || dto.status === 'archived') {
      await this.scheduler.removeSchedule(id);
    }

    return updated;
  }

  async remove(workspaceId: string, id: string) {
    await this.findOne(workspaceId, id);
    await this.prisma.workflow.delete({ where: { id } });
    await this.scheduler.removeSchedule(id);
  }

  async saveGraph(
    workspaceId: string,
    id: string,
    userId: string,
    rawGraph: unknown,
  ) {
    const workflow = await this.findOne(workspaceId, id);

    const parsed = workflowGraphSchema.safeParse(rawGraph);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Grafo invalido.',
        issues: parsed.error.issues,
      });
    }

    const lastVersion = await this.prisma.workflowVersion.findFirst({
      where: { workflowId: id },
      orderBy: { versionNumber: 'desc' },
    });
    const nextVersionNumber = (lastVersion?.versionNumber ?? 0) + 1;
    const { graph: graphWithWebhook, webhookId } = ensureWebhookId(parsed.data);
    const { graph, chatToken, inboxToken } = ensureChatTokens(graphWithWebhook);

    const updated = await this.prisma.$transaction(async (tx) => {
      const version = await tx.workflowVersion.create({
        data: {
          workflowId: id,
          versionNumber: nextVersionNumber,
          graph: toJsonInput(graph),
          createdById: userId,
        },
      });
      return tx.workflow.update({
        where: { id: workflow.id },
        data: {
          currentVersionId: version.id,
          webhookId,
          chatToken,
          inboxToken,
        },
        include: { currentVersion: true },
      });
    });
    await this.scheduler.syncWorkflowSchedule(id, workspaceId, graph);
    return updated;
  }

  async listVersions(workspaceId: string, id: string) {
    const workflow = await this.findOne(workspaceId, id);
    const versions = await this.prisma.workflowVersion.findMany({
      where: { workflowId: id },
      orderBy: { versionNumber: 'desc' },
      include: { createdBy: { select: { name: true } } },
    });
    return versions.map((version) => ({
      id: version.id,
      versionNumber: version.versionNumber,
      createdAt: version.createdAt,
      createdByName: version.createdBy.name,
      isCurrent: version.id === workflow.currentVersionId,
    }));
  }

  async getVersion(workspaceId: string, id: string, versionId: string) {
    await this.findOne(workspaceId, id);
    const version = await this.prisma.workflowVersion.findFirst({
      where: { id: versionId, workflowId: id },
      include: { createdBy: { select: { name: true } } },
    });
    if (!version) {
      throw new NotFoundException('Versao nao encontrada.');
    }
    return version;
  }

  /**
   * "Publicar"/rollback sao a mesma operacao: clona o graph da versao alvo
   * como uma NOVA versao (preserva historico linear e auditavel, como um
   * git revert) e aponta o workflow para ela.
   */
  async rollback(
    workspaceId: string,
    id: string,
    userId: string,
    versionId: string,
  ) {
    const workflow = await this.findOne(workspaceId, id);
    const target = await this.prisma.workflowVersion.findFirst({
      where: { id: versionId, workflowId: id },
    });
    if (!target) {
      throw new NotFoundException('Versao nao encontrada.');
    }

    const lastVersion = await this.prisma.workflowVersion.findFirst({
      where: { workflowId: id },
      orderBy: { versionNumber: 'desc' },
    });
    const nextVersionNumber = (lastVersion?.versionNumber ?? 0) + 1;
    const { graph: graphWithWebhook, webhookId } = ensureWebhookId(
      target.graph as unknown as WorkflowGraph,
    );
    const { graph, chatToken, inboxToken } = ensureChatTokens(graphWithWebhook);

    const updated = await this.prisma.$transaction(async (tx) => {
      const version = await tx.workflowVersion.create({
        data: {
          workflowId: id,
          versionNumber: nextVersionNumber,
          graph: toJsonInput(graph),
          createdById: userId,
        },
      });
      return tx.workflow.update({
        where: { id: workflow.id },
        data: {
          currentVersionId: version.id,
          webhookId,
          chatToken,
          inboxToken,
        },
        include: { currentVersion: true },
      });
    });
    await this.scheduler.syncWorkflowSchedule(id, workspaceId, graph);
    return updated;
  }
}
