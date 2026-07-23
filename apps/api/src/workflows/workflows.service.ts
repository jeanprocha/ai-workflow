import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { workflowGraphSchema, EMPTY_GRAPH } from './graph.schema';

function toJsonInput(graph: unknown): Prisma.InputJsonValue {
  return graph as Prisma.InputJsonValue;
}

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService) {}

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

    return this.prisma.$transaction(async (tx) => {
      const version = await tx.workflowVersion.create({
        data: {
          workflowId: id,
          versionNumber: nextVersionNumber,
          graph: toJsonInput(parsed.data),
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
