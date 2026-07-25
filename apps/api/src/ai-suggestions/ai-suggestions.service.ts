import { Injectable, NotFoundException } from '@nestjs/common';
import type { AiSuggestionType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Telemetria compartilhada pelas 4 features de IA da Fase 11 (Autocomplete,
 * Copilot, Debugger, Cost Optimizer): cada sugestao gerada vira uma linha
 * aqui, e o aceite/rejeicao do usuario fica registrado para medir/ajustar os
 * prompts internos depois.
 */
@Injectable()
export class AiSuggestionsService {
  constructor(private readonly prisma: PrismaService) {}

  create(params: {
    workspaceId: string;
    type: AiSuggestionType;
    workflowId?: string;
    executionId?: string;
    payload: unknown;
    /** Da ChatResult do provider — ausente pra tipos que nao chamam LLM (ex.: cost_optimizer). */
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
  }) {
    return this.prisma.aiSuggestion.create({
      data: {
        workspaceId: params.workspaceId,
        type: params.type,
        workflowId: params.workflowId,
        executionId: params.executionId,
        payload: params.payload as Prisma.InputJsonValue,
        model: params.model,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        costUsd: params.costUsd,
      },
    });
  }

  async findOne(workspaceId: string, id: string) {
    const suggestion = await this.prisma.aiSuggestion.findFirst({
      where: { id, workspaceId },
    });
    if (!suggestion) {
      throw new NotFoundException('Sugestao nao encontrada.');
    }
    return suggestion;
  }

  async resolve(
    workspaceId: string,
    id: string,
    status: 'accepted' | 'rejected',
  ) {
    await this.findOne(workspaceId, id);
    return this.prisma.aiSuggestion.update({
      where: { id },
      data: { status, resolvedAt: new Date() },
    });
  }

  list(
    workspaceId: string,
    filters: { workflowId?: string; type?: AiSuggestionType },
  ) {
    return this.prisma.aiSuggestion.findMany({
      where: {
        workspaceId,
        workflowId: filters.workflowId,
        type: filters.type,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
