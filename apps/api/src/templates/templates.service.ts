import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { WorkflowGraph } from '@workflow/shared';
import { PrismaService } from '../prisma/prisma.service';
import { workflowGraphSchema } from '../workflows/graph.schema';
import {
  ensureChatTokens,
  ensureWebhookId,
  toJsonInput,
} from '../workflows/workflows.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { sanitizeTemplateGraph, stripInheritedTokens } from './template-sanitizer';

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Globais (workspace_id NULL) + os do proprio workspace (ADR-006). */
  private scopeWhere(workspaceId: string) {
    return { OR: [{ workspaceId: null }, { workspaceId }] };
  }

  list(workspaceId: string) {
    return this.prisma.template.findMany({
      where: this.scopeWhere(workspaceId),
      orderBy: { createdAt: 'asc' },
    });
  }

  async use(workspaceId: string, userId: string, templateId: string) {
    const template = await this.prisma.template.findFirst({
      where: { id: templateId, ...this.scopeWhere(workspaceId) },
    });
    if (!template) {
      throw new NotFoundException('Template nao encontrado.');
    }

    // Mesma porta de entrada de saveGraph (workflows.service.ts:174-180): sem
    // isso, um template com node.type inexistente entrava no banco e so
    // quebrava na primeira execucao do fluxo instanciado.
    const parsed = workflowGraphSchema.safeParse(template.graph);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Template invalido ou incompativel com a versao atual.',
        issues: parsed.error.issues,
      });
    }

    const { graph: graphWithWebhook, webhookId } = ensureWebhookId(
      stripInheritedTokens(parsed.data),
    );
    const { graph, chatToken, inboxToken } = ensureChatTokens(graphWithWebhook);

    return this.prisma.$transaction(async (tx) => {
      const workflow = await tx.workflow.create({
        data: {
          workspaceId,
          name: template.name,
          description: template.description,
          webhookId: webhookId ?? undefined,
          chatToken: chatToken ?? undefined,
          inboxToken: inboxToken ?? undefined,
        },
      });
      const version = await tx.workflowVersion.create({
        data: {
          workflowId: workflow.id,
          versionNumber: 1,
          graph: toJsonInput(graph),
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

  /** Cria um template por REFERENCIA a um fluxo (nao aceita grafo cru do cliente). */
  async create(workspaceId: string, dto: CreateTemplateDto) {
    // findFirst, nao findUnique: com workspaceId sempre preenchido aqui o
    // indice funcionaria, mas o padrao do metodo casa com update() abaixo
    // (que precisa de findFirst por causa do NULL de templates globais).
    const existing = await this.prisma.template.findFirst({
      where: { workspaceId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException(
        'Ja existe um template com este nome neste workspace.',
      );
    }

    const workflow = await this.prisma.workflow.findFirst({
      where: { id: dto.workflowId, workspaceId },
      include: { currentVersion: true },
    });
    if (!workflow) {
      throw new NotFoundException('Fluxo nao encontrado.');
    }

    let version = workflow.currentVersion;
    if (dto.versionId) {
      version = await this.prisma.workflowVersion.findFirst({
        where: { id: dto.versionId, workflowId: workflow.id },
      });
      if (!version) {
        throw new NotFoundException('Versao nao encontrada.');
      }
    }
    if (!version) {
      throw new BadRequestException(
        'Este fluxo ainda nao tem uma versao salva.',
      );
    }

    const sanitized = sanitizeTemplateGraph(
      version.graph as unknown as WorkflowGraph,
    );
    const parsed = workflowGraphSchema.safeParse(sanitized);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Grafo invalido.',
        issues: parsed.error.issues,
      });
    }

    return this.prisma.template.create({
      data: {
        workspaceId,
        name: dto.name,
        description: dto.description ?? '',
        category: dto.category,
        graph: toJsonInput(parsed.data),
      },
    });
  }

  /** Gate de ownership: template global ou de outro workspace cai no mesmo 404. */
  private async findOwned(workspaceId: string, id: string) {
    const template = await this.prisma.template.findFirst({
      where: { id, workspaceId },
    });
    if (!template) {
      throw new NotFoundException('Template nao encontrado.');
    }
    return template;
  }

  async update(workspaceId: string, id: string, dto: UpdateTemplateDto) {
    await this.findOwned(workspaceId, id);

    if (dto.name !== undefined) {
      const clash = await this.prisma.template.findFirst({
        where: { workspaceId, name: dto.name, NOT: { id } },
      });
      if (clash) {
        throw new ConflictException(
          'Ja existe um template com este nome neste workspace.',
        );
      }
    }

    return this.prisma.template.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
      },
    });
  }

  async remove(workspaceId: string, id: string) {
    await this.findOwned(workspaceId, id);
    await this.prisma.template.delete({ where: { id } });
  }
}
