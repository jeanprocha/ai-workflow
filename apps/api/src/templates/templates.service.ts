import { Injectable, NotFoundException } from '@nestjs/common';
import type { WorkflowGraph } from '@workflow/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ensureWebhookId, toJsonInput } from '../workflows/workflows.service';

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.template.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async use(workspaceId: string, userId: string, templateId: string) {
    const template = await this.prisma.template.findUnique({
      where: { id: templateId },
    });
    if (!template) {
      throw new NotFoundException('Template nao encontrado.');
    }

    const { graph, webhookId } = ensureWebhookId(
      template.graph as unknown as WorkflowGraph,
    );

    return this.prisma.$transaction(async (tx) => {
      const workflow = await tx.workflow.create({
        data: {
          workspaceId,
          name: template.name,
          description: template.description,
          webhookId: webhookId ?? undefined,
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
}
