import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { randomUUID } from 'crypto';
import type { Queue } from 'bullmq';
import type { Prisma, TriggerType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EXECUTIONS_QUEUE } from '../queue/queue.module';
import { ListExecutionsQueryDto } from './dto/list-executions-query.dto';
import { ReplayExecutionDto } from './dto/replay-execution.dto';

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : (value as Prisma.InputJsonValue);
}

const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class ExecutionsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(EXECUTIONS_QUEUE) private readonly queue: Queue,
  ) {}

  async trigger(
    workspaceId: string,
    workflowId: string,
    triggerType: TriggerType,
    inputPayload: unknown,
  ) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: workflowId, workspaceId },
    });
    if (!workflow) {
      throw new NotFoundException('Fluxo nao encontrado.');
    }
    return this.createAndEnqueue({
      workflowId: workflow.id,
      versionId: workflow.currentVersionId,
      triggerType,
      inputPayload,
    });
  }

  async triggerByWebhook(webhookId: string, inputPayload: unknown) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { webhookId },
    });
    if (!workflow) {
      throw new NotFoundException('Webhook nao encontrado.');
    }
    return this.createAndEnqueue({
      workflowId: workflow.id,
      versionId: workflow.currentVersionId,
      triggerType: 'webhook',
      inputPayload,
    });
  }

  private async createAndEnqueue(params: {
    workflowId: string;
    versionId: string | null;
    triggerType: TriggerType;
    inputPayload: unknown;
    parentExecutionId?: string;
    traceId?: string;
    replayFromNodeId?: string;
  }) {
    const {
      workflowId,
      versionId,
      triggerType,
      inputPayload,
      parentExecutionId,
      replayFromNodeId,
    } = params;

    if (!versionId) {
      throw new BadRequestException(
        'Este fluxo ainda nao tem uma versao salva.',
      );
    }

    const id = randomUUID();
    const execution = await this.prisma.execution.create({
      data: {
        id,
        workflowId,
        versionId,
        triggerType,
        inputPayload: toJson(inputPayload),
        status: 'queued',
        parentExecutionId,
        traceId: params.traceId ?? id,
        replayFromNodeId,
      },
    });

    await this.queue.add('run', {
      executionId: execution.id,
      replayFromNodeId,
      replayInput: replayFromNodeId ? inputPayload : undefined,
    });
    return execution;
  }

  async list(workspaceId: string, query: ListExecutionsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.ExecutionWhereInput = {
      workflow: {
        workspaceId,
        ...(query.search
          ? { name: { contains: query.search, mode: 'insensitive' } }
          : {}),
      },
      ...(query.workflowId ? { workflowId: query.workflowId } : {}),
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.from || query.to
        ? {
            startedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.execution.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        include: { workflow: { select: { name: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.execution.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(workspaceId: string, id: string) {
    const execution = await this.prisma.execution.findFirst({
      where: { id, workflow: { workspaceId } },
      include: {
        steps: { orderBy: { startedAt: 'asc' } },
        logs: { orderBy: { createdAt: 'asc' } },
        workflow: { select: { name: true } },
      },
    });
    if (!execution) {
      throw new NotFoundException('Execucao nao encontrada.');
    }
    return execution;
  }

  /** Re-executa a mesma execucao do zero, com o mesmo input original. */
  async retry(workspaceId: string, id: string) {
    const original = await this.findOne(workspaceId, id);
    return this.createAndEnqueue({
      workflowId: original.workflowId,
      versionId: original.versionId,
      triggerType: original.triggerType,
      inputPayload: original.inputPayload,
      parentExecutionId: original.id,
      traceId: original.traceId ?? original.id,
    });
  }

  /**
   * Replay completo (do trigger) ou parcial (a partir de um node, reaproveitando
   * os outputs persistidos dos nodes upstream da execucao original).
   */
  async replay(workspaceId: string, id: string, dto: ReplayExecutionDto) {
    const original = await this.findOne(workspaceId, id);

    if (dto.fromNodeId) {
      // O node de partida do replay parcial e tipicamente o que falhou —
      // so precisamos que ele tenha sido tentado (para ter um input original
      // de referencia); os ancestrais bem-sucedidos sao reaproveitados no engine.
      const originalStep = original.steps.find(
        (step) => step.nodeId === dto.fromNodeId,
      );
      if (!originalStep) {
        throw new BadRequestException(
          `O node "${dto.fromNodeId}" nao foi executado na execucao original — nao ha o que reaproveitar.`,
        );
      }
      return this.createAndEnqueue({
        workflowId: original.workflowId,
        versionId: original.versionId,
        triggerType: original.triggerType,
        inputPayload: dto.input !== undefined ? dto.input : originalStep.input,
        parentExecutionId: original.id,
        traceId: original.traceId ?? original.id,
        replayFromNodeId: dto.fromNodeId,
      });
    }

    return this.createAndEnqueue({
      workflowId: original.workflowId,
      versionId: original.versionId,
      triggerType: original.triggerType,
      inputPayload: dto.input !== undefined ? dto.input : original.inputPayload,
      parentExecutionId: original.id,
      traceId: original.traceId ?? original.id,
    });
  }
}
