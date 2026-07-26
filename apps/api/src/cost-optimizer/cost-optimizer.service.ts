import { BadRequestException, Injectable } from '@nestjs/common';
import { MODEL_REGISTRY, type ModelInfo } from '@workflow/ai';
import type { WorkflowGraph } from '@workflow/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { AiSuggestionsService } from '../ai-suggestions/ai-suggestions.service';

const ANALYSIS_WINDOW_DAYS = 30;
const MIN_SAMPLE_SIZE = 3;
const MIN_SAVINGS_PERCENT = 15;

const TIER_RANK: Record<ModelInfo['tier'], number> = {
  flagship: 2,
  standard: 1,
  economy: 0,
};

/** Nodes de tarefa mais "fechada" (schema/classe fixos) toleram descer mais de tier. */
const CONSTRAINED_TASK_NODE_TYPES = new Set([
  'ai.extraction',
  'ai.classification',
  'ai.embeddings',
]);

function blendedPricePerMillion(model: ModelInfo): number {
  return (model.inputPricePerMillion + model.outputPricePerMillion) / 2;
}

export interface CostOptimizerSuggestion {
  suggestionId: string;
  workflowId: string;
  workflowName: string;
  nodeId: string;
  nodeLabel: string;
  currentProvider: string;
  currentModel: string;
  suggestedProvider: string;
  suggestedModel: string;
  sampleSize: number;
  avgCostUsd: number;
  estimatedSavingsPercent: number;
}

/**
 * AI Cost Optimizer (Fase 11): analisa o historico real de execucoes (custo
 * por node/model, ExecutionStep) e sugere trocar por um modelo mais barato de
 * tier igual ou inferior — nunca sugere "subir" de tier. Estimativa de
 * economia e baseada no preco medio ($ por 1M tokens, entrada+saida) porque
 * ExecutionStep so grava tokens totais, sem separar entrada/saida.
 */
@Injectable()
export class CostOptimizerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflows: WorkflowsService,
    private readonly suggestions: AiSuggestionsService,
  ) {}

  async analyze(
    workspaceId: string,
    workflowId?: string,
  ): Promise<CostOptimizerSuggestion[]> {
    const since = new Date(
      Date.now() - ANALYSIS_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const steps = await this.prisma.executionStep.findMany({
      where: {
        model: { not: null },
        status: 'success',
        execution: {
          startedAt: { gte: since },
          workflow: {
            workspaceId,
            ...(workflowId ? { id: workflowId } : {}),
          },
        },
      },
      select: {
        nodeId: true,
        nodeType: true,
        model: true,
        costUsd: true,
        execution: {
          select: { workflowId: true, workflow: { select: { name: true } } },
        },
      },
    });

    type Key = string;
    const groups = new Map<
      Key,
      {
        workflowId: string;
        workflowName: string;
        nodeId: string;
        nodeType: string;
        model: string;
        count: number;
        costSum: number;
      }
    >();

    for (const step of steps) {
      if (!step.model) continue;
      const key = `${step.execution.workflowId}::${step.nodeId}::${step.model}`;
      const existing = groups.get(key);
      if (existing) {
        existing.count += 1;
        existing.costSum += step.costUsd ?? 0;
      } else {
        groups.set(key, {
          workflowId: step.execution.workflowId,
          workflowName: step.execution.workflow.name,
          nodeId: step.nodeId,
          nodeType: step.nodeType,
          model: step.model,
          count: 1,
          costSum: step.costUsd ?? 0,
        });
      }
    }

    const results: CostOptimizerSuggestion[] = [];
    // Cache por workflowId — varios grupos podem ser do mesmo fluxo
    // (nodes diferentes), sem isso seria um SELECT por grupo.
    const graphCache = new Map<string, WorkflowGraph | undefined>();
    const getGraph = async (
      workflowId: string,
    ): Promise<WorkflowGraph | undefined> => {
      if (graphCache.has(workflowId)) return graphCache.get(workflowId);
      const workflow = await this.prisma.workflow.findUnique({
        where: { id: workflowId },
        select: { currentVersion: { select: { graph: true } } },
      });
      const graph = workflow?.currentVersion?.graph as unknown as
        WorkflowGraph | undefined;
      graphCache.set(workflowId, graph);
      return graph;
    };

    for (const group of groups.values()) {
      if (group.count < MIN_SAMPLE_SIZE) continue;

      const currentModel = MODEL_REGISTRY.find((m) => m.id === group.model);
      if (!currentModel || currentModel.tier === 'economy') continue;

      const maxRank = CONSTRAINED_TASK_NODE_TYPES.has(group.nodeType)
        ? TIER_RANK[currentModel.tier]
        : TIER_RANK[currentModel.tier] - 1;

      const currentBlended = blendedPricePerMillion(currentModel);
      const candidates = MODEL_REGISTRY.filter(
        (candidate) =>
          candidate.id !== currentModel.id &&
          // Ollama fica de fora da sugestao principal: trocar de provider de
          // API e um ajuste de config; migrar pra um modelo local e uma
          // decisao operacional bem maior (requer infra propria rodando).
          candidate.provider !== 'ollama' &&
          TIER_RANK[candidate.tier] <= Math.max(maxRank, 0) &&
          blendedPricePerMillion(candidate) < currentBlended,
      ).sort((a, b) => blendedPricePerMillion(a) - blendedPricePerMillion(b));

      const best = candidates[0];
      if (!best) continue;

      const savingsPercent =
        ((currentBlended - blendedPricePerMillion(best)) / currentBlended) *
        100;
      if (savingsPercent < MIN_SAVINGS_PERCENT) continue;

      const avgCostUsd = group.costSum / group.count;
      // nodeLabel antes era sempre igual a nodeId (ex.: "node n2" no card,
      // em vez do label humano do node) — resolve o label real no grafo da
      // versao atual do fluxo, com fallback pro id se o node nao existir
      // mais la (fluxo editado depois das execucoes analisadas).
      const graph = await getGraph(group.workflowId);
      const nodeLabel =
        graph?.nodes.find((node) => node.id === group.nodeId)?.label ??
        group.nodeId;

      const suggestionRow = await this.suggestions.create({
        workspaceId,
        type: 'cost_optimizer',
        workflowId: group.workflowId,
        payload: {
          nodeId: group.nodeId,
          currentProvider: currentModel.provider,
          currentModel: currentModel.id,
          suggestedProvider: best.provider,
          suggestedModel: best.id,
          sampleSize: group.count,
          avgCostUsd,
          estimatedSavingsPercent: Math.round(savingsPercent),
        },
      });

      results.push({
        suggestionId: suggestionRow.id,
        workflowId: group.workflowId,
        workflowName: group.workflowName,
        nodeId: group.nodeId,
        nodeLabel,
        currentProvider: currentModel.provider,
        currentModel: currentModel.id,
        suggestedProvider: best.provider,
        suggestedModel: best.id,
        sampleSize: group.count,
        avgCostUsd,
        estimatedSavingsPercent: Math.round(savingsPercent),
      });
    }

    return results.sort(
      (a, b) => b.estimatedSavingsPercent - a.estimatedSavingsPercent,
    );
  }

  async applySuggestion(
    workspaceId: string,
    userId: string,
    suggestionId: string,
  ) {
    const suggestionRow = await this.suggestions.findOne(
      workspaceId,
      suggestionId,
    );
    if (suggestionRow.type !== 'cost_optimizer' || !suggestionRow.workflowId) {
      throw new BadRequestException('Sugestao invalida para aplicacao.');
    }

    const payload = suggestionRow.payload as {
      nodeId: string;
      suggestedProvider: string;
      suggestedModel: string;
    };

    const workflow = await this.workflows.findOne(
      workspaceId,
      suggestionRow.workflowId,
    );
    const currentGraph = workflow.currentVersion?.graph as unknown as
      WorkflowGraph | undefined;
    if (!currentGraph) {
      throw new BadRequestException('Fluxo sem versao atual.');
    }

    const patchedGraph: WorkflowGraph = {
      ...currentGraph,
      nodes: currentGraph.nodes.map((node) =>
        node.id === payload.nodeId
          ? {
              ...node,
              config: {
                ...node.config,
                provider: payload.suggestedProvider,
                model: payload.suggestedModel,
              },
            }
          : node,
      ),
    };

    const updated = await this.workflows.saveGraph(
      workspaceId,
      suggestionRow.workflowId,
      userId,
      patchedGraph,
    );
    await this.suggestions.resolve(workspaceId, suggestionId, 'accepted');

    return updated;
  }
}
