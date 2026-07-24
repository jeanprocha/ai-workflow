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
    await this.findOne(workspaceId, id);
    return this.prisma.workflow.update({ where: { id }, data: dto });
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
    const { graph, webhookId } = ensureWebhookId(parsed.data);

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
        data: { currentVersionId: version.id, webhookId },
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
    const { graph, webhookId } = ensureWebhookId(
      target.graph as unknown as WorkflowGraph,
    );

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
        data: { currentVersionId: version.id, webhookId },
        include: { currentVersion: true },
      });
    });
    await this.scheduler.syncWorkflowSchedule(id, workspaceId, graph);
    return updated;
  }
}
