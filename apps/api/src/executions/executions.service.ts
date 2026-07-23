import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Prisma, TriggerType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EXECUTIONS_QUEUE } from '../queue/queue.module';

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : (value as Prisma.InputJsonValue);
}

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
    return this.createAndEnqueue(
      workflow.id,
      workflow.currentVersionId,
      triggerType,
      inputPayload,
    );
  }

  async triggerByWebhook(webhookId: string, inputPayload: unknown) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { webhookId },
    });
    if (!workflow) {
      throw new NotFoundException('Webhook nao encontrado.');
    }
    return this.createAndEnqueue(
      workflow.id,
      workflow.currentVersionId,
      'webhook',
      inputPayload,
    );
  }

  private async createAndEnqueue(
    workflowId: string,
    versionId: string | null,
    triggerType: TriggerType,
    inputPayload: unknown,
  ) {
    if (!versionId) {
      throw new BadRequestException(
        'Este fluxo ainda nao tem uma versao salva.',
      );
    }

    const execution = await this.prisma.execution.create({
      data: {
        workflowId,
        versionId,
        triggerType,
        inputPayload: toJson(inputPayload),
        status: 'queued',
      },
    });

    await this.queue.add('run', { executionId: execution.id });
    return execution;
  }

  list(workspaceId: string) {
    return this.prisma.execution.findMany({
      where: { workflow: { workspaceId } },
      orderBy: { startedAt: 'desc' },
      include: { workflow: { select: { name: true } } },
    });
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
}
