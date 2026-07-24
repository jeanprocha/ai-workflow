import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { getNodeDefinition, resolveExpressions } from '@workflow/nodes';
import type {
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
} from '@workflow/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionEventsService } from '../execution-events/execution-events.service';
import { CryptoService } from '../crypto/crypto.service';
import { AgentsService } from '../agents/agents.service';
import { KnowledgeService } from '../knowledge/knowledge.service';

const NODE_TIMEOUT_MS = 30_000;

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

interface NodeUsage {
  tokens: number;
  model: string;
  costUsd: number;
}

interface NodeStepResult {
  nodeId: string;
  ok: boolean;
  output?: unknown;
  branches?: string[];
  varsPatch?: Record<string, unknown>;
  error?: string;
  usage?: NodeUsage;
}

/**
 * Engine de execucao (v1 — ADR-005: worker no processo da API).
 *
 * Percorre o grafo em "ondas": todos os nodes prontos numa onda executam
 * concorrentemente (Promise.all), o que da execucao paralela real ao node
 * Parallel (e a qualquer fan-out). Um node do tipo logic.merge so entra na
 * proxima onda quando TODAS as suas edges de entrada tiverem completado
 * (join), recebendo um array com os outputs acumulados como input.
 */
@Injectable()
export class EngineService {
  private readonly logger = new Logger(EngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ExecutionEventsService,
    private readonly crypto: CryptoService,
    private readonly agents: AgentsService,
    private readonly knowledge: KnowledgeService,
  ) {}

  async run(
    executionId: string,
    options?: { replayFromNodeId?: string; replayInput?: unknown },
  ): Promise<void> {
    const execution = await this.prisma.execution.findUniqueOrThrow({
      where: { id: executionId },
      include: { version: true, workflow: true },
    });

    await this.prisma.execution.update({
      where: { id: executionId },
      data: { status: 'running' },
    });
    this.events.emit({ type: 'execution.started', executionId });

    const workspaceId = execution.workflow.workspaceId;
    const graph = execution.version.graph as unknown as WorkflowGraph;
    const nodesById = new Map<string, WorkflowNode>(
      graph.nodes.map((node) => [node.id, node]),
    );
    const outgoing = new Map<string, WorkflowEdge[]>();
    const incoming = new Map<string, WorkflowEdge[]>();
    const incomingCount = new Map<string, number>();
    for (const edge of graph.edges) {
      const list = outgoing.get(edge.source) ?? [];
      list.push(edge);
      outgoing.set(edge.source, list);
      incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
      const inList = incoming.get(edge.target) ?? [];
      inList.push(edge);
      incoming.set(edge.target, inList);
    }

    const triggerNode = graph.nodes.find((node) => node.category === 'trigger');

    const nodeOutputs: Record<string, unknown> = {};
    let vars: Record<string, unknown> = {};
    let lastOutput: unknown = null;
    let overallStatus: 'success' | 'failed' = 'success';
    let failureError: string | null = null;
    let tokensTotal = 0;
    let costUsdTotal = 0;

    const startNode = options?.replayFromNodeId
      ? nodesById.get(options.replayFromNodeId)
      : triggerNode;

    if (!startNode) {
      overallStatus = 'failed';
      failureError = options?.replayFromNodeId
        ? `Node ${options.replayFromNodeId} nao encontrado no grafo.`
        : 'O fluxo nao possui um node trigger.';
    } else {
      const executed = new Set<string>();
      const mergeBuffers = new Map<string, unknown[]>();

      // Partial replay: nodes upstream do node de partida nao sao re-executados —
      // seus outputs sao reaproveitados da execucao original (persistidos em
      // ExecutionStep). Variaveis (logic.setVariables) acumuladas antes do ponto
      // de replay nao sao reconstituidas (limitacao conhecida da v1).
      if (options?.replayFromNodeId && execution.parentExecutionId) {
        const ancestors = this.computeAncestors(
          options.replayFromNodeId,
          incoming,
        );
        const parentSteps = await this.prisma.executionStep.findMany({
          where: {
            executionId: execution.parentExecutionId,
            status: 'success',
            nodeId: { in: [...ancestors] },
          },
        });
        for (const step of parentSteps) {
          nodeOutputs[step.nodeId] = step.output;
          executed.add(step.nodeId);
        }
      }

      let currentWave = new Map<string, unknown>([
        [
          startNode.id,
          options?.replayFromNodeId
            ? options.replayInput
            : execution.inputPayload,
        ],
      ]);

      while (currentWave.size > 0) {
        const waveItems = [...currentWave.entries()].filter(
          ([nodeId]) => !executed.has(nodeId),
        );
        if (waveItems.length === 0) break;
        for (const [nodeId] of waveItems) executed.add(nodeId);

        const results = await Promise.all(
          waveItems.map(([nodeId, input]) => {
            const node = nodesById.get(nodeId);
            if (!node) {
              return Promise.resolve<NodeStepResult>({
                nodeId,
                ok: false,
                error: `Node ${nodeId} nao encontrado no grafo.`,
              });
            }
            return this.executeNodeWithRetry({
              executionId,
              node,
              input,
              vars,
              nodeOutputs,
              workspaceId,
            });
          }),
        );

        let waveFailed = false;
        for (const result of results) {
          if (result.ok) {
            nodeOutputs[result.nodeId] = result.output;
            lastOutput = result.output;
            if (result.varsPatch) vars = { ...vars, ...result.varsPatch };
            if (result.usage) {
              tokensTotal += result.usage.tokens;
              costUsdTotal += result.usage.costUsd;
            }
          } else {
            waveFailed = true;
            failureError = result.error ?? 'Erro desconhecido.';
          }
        }

        if (waveFailed) {
          // Fail-fast (v1): uma falha em qualquer node da onda para a execucao
          // inteira, mesmo que branches irmas independentes tivessem sucesso.
          // Replay parcial a partir do node falho fica para a Fase 6.
          overallStatus = 'failed';
          break;
        }

        const nextWave = new Map<string, unknown>();
        for (const result of results) {
          if (!result.ok) continue;
          for (const edge of outgoing.get(result.nodeId) ?? []) {
            if (
              edge.sourceHandle &&
              !(result.branches ?? []).includes(edge.sourceHandle)
            )
              continue;
            if (executed.has(edge.target)) continue;

            const targetNode = nodesById.get(edge.target);
            if (targetNode?.type === 'logic.merge') {
              const buffer = mergeBuffers.get(edge.target) ?? [];
              buffer.push(result.output);
              mergeBuffers.set(edge.target, buffer);
              const required = incomingCount.get(edge.target) ?? 1;
              if (buffer.length >= required) {
                nextWave.set(edge.target, buffer.slice());
              }
            } else {
              nextWave.set(edge.target, result.output);
            }
          }
        }
        currentWave = nextWave;
      }
    }

    await this.prisma.execution.update({
      where: { id: executionId },
      data: {
        status: overallStatus,
        error: failureError,
        finishedAt: new Date(),
        durationMs: Date.now() - execution.startedAt.getTime(),
        outputPayload: lastOutput === null ? undefined : toJson(lastOutput),
        tokensTotal,
        costUsd: costUsdTotal,
      },
    });

    this.events.emit({
      type: 'execution.completed',
      executionId,
      status: overallStatus,
    });
  }

  private async executeNodeWithRetry(params: {
    executionId: string;
    node: WorkflowNode;
    input: unknown;
    vars: Record<string, unknown>;
    nodeOutputs: Record<string, unknown>;
    workspaceId: string;
  }): Promise<NodeStepResult> {
    const { executionId, node, input, vars, nodeOutputs, workspaceId } = params;

    const definition = getNodeDefinition(node.type);
    if (!definition) {
      const message = `Node type desconhecido: ${node.type}`;
      await this.recordStep({
        executionId,
        node,
        status: 'failed',
        input,
        output: null,
        error: message,
        durationMs: 0,
        attempt: 1,
      });
      return { nodeId: node.id, ok: false, error: message };
    }

    const resolvedConfig = resolveExpressions(node.config, {
      input,
      vars,
      nodeOutputs,
    });
    const attempts = node.retry?.attempts ?? 1;
    const backoffMs = node.retry?.backoffMs ?? 0;

    let lastError = 'Erro desconhecido.';

    for (let attempt = 1; attempt <= attempts; attempt++) {
      this.events.emit({ type: 'step.started', executionId, nodeId: node.id });
      const startedAt = Date.now();

      try {
        const result = await this.withTimeout(
          Promise.resolve(
            definition.execute({
              config: resolvedConfig as never,
              input,
              vars,
              log: (event, payload) => {
                void this.recordLog(executionId, node.id, event, payload);
              },
              getCredential: (name) => this.getCredential(workspaceId, name),
              callAgent: async (agentId, message) => {
                const result = await this.agents.chat(
                  workspaceId,
                  agentId,
                  message,
                );
                return {
                  content: result.content,
                  tokens: result.tokensTotal,
                  costUsd: result.costUsd,
                };
              },
              searchKnowledge: async (knowledgeBaseId, query, opts) => {
                const results = await this.knowledge.search(
                  workspaceId,
                  knowledgeBaseId,
                  { query, topK: opts?.topK, threshold: opts?.threshold },
                );
                return results.map((result) => ({
                  documentName: result.documentName,
                  content: result.content,
                  similarity: result.similarity,
                }));
              },
            }),
          ),
          NODE_TIMEOUT_MS,
        );

        const durationMs = Date.now() - startedAt;
        await this.recordStep({
          executionId,
          node,
          status: 'success',
          input,
          output: result.output,
          error: null,
          durationMs,
          attempt,
          usage: result.usage,
        });
        this.events.emit({
          type: 'step.completed',
          executionId,
          nodeId: node.id,
          status: 'success',
          output: result.output,
        });
        return {
          nodeId: node.id,
          ok: true,
          output: result.output,
          branches: result.branches,
          varsPatch: result.varsPatch,
          usage: result.usage,
        };
      } catch (error) {
        const durationMs = Date.now() - startedAt;
        const message = error instanceof Error ? error.message : String(error);
        lastError = message;
        await this.recordStep({
          executionId,
          node,
          status: 'failed',
          input,
          output: null,
          error: message,
          durationMs,
          attempt,
        });
        this.events.emit({
          type: 'step.completed',
          executionId,
          nodeId: node.id,
          status: 'failed',
          error: message,
        });

        if (attempt < attempts) {
          await new Promise((resolve) =>
            setTimeout(resolve, backoffMs * attempt),
          );
        }
      }
    }

    return { nodeId: node.id, ok: false, error: lastError };
  }

  /** Retorna o conjunto de nodes alcancaveis "para tras" a partir de targetId (exclusive). */
  private computeAncestors(
    targetId: string,
    incoming: Map<string, WorkflowEdge[]>,
  ): Set<string> {
    const seen = new Set<string>();
    const stack = [targetId];
    while (stack.length > 0) {
      const id = stack.pop();
      if (id === undefined) continue;
      for (const edge of incoming.get(id) ?? []) {
        if (!seen.has(edge.source)) {
          seen.add(edge.source);
          stack.push(edge.source);
        }
      }
    }
    return seen;
  }

  private async getCredential(
    workspaceId: string,
    name: string,
  ): Promise<string> {
    const credential = await this.prisma.credential.findFirst({
      where: { workspaceId, name },
    });
    if (!credential) {
      throw new Error(`Credencial "${name}" nao encontrada neste workspace.`);
    }
    return this.crypto.decrypt(credential.encryptedData);
  }

  private async recordStep(params: {
    executionId: string;
    node: WorkflowNode;
    status: 'success' | 'failed';
    input: unknown;
    output: unknown;
    error: string | null;
    durationMs: number;
    attempt: number;
    usage?: NodeUsage;
  }) {
    const {
      executionId,
      node,
      status,
      input,
      output,
      error,
      durationMs,
      attempt,
      usage,
    } = params;
    await this.prisma.executionStep.create({
      data: {
        executionId,
        nodeId: node.id,
        nodeType: node.type,
        status,
        input: input === undefined ? undefined : toJson(input),
        output:
          output === undefined || output === null ? undefined : toJson(output),
        error,
        durationMs,
        attempt,
        tokens: usage?.tokens,
        model: usage?.model,
        costUsd: usage?.costUsd,
        memoryMb: process.memoryUsage().heapUsed / (1024 * 1024),
        startedAt: new Date(Date.now() - durationMs),
        finishedAt: new Date(),
      },
    });
  }

  private async recordLog(
    executionId: string,
    nodeId: string,
    event: string,
    payload: unknown,
  ) {
    try {
      await this.prisma.executionLog.create({
        data: {
          executionId,
          nodeId,
          level: 'info',
          event,
          payload: payload === undefined ? undefined : toJson(payload),
        },
      });
      this.events.emit({
        type: 'log.created',
        executionId,
        nodeId,
        level: 'info',
        event,
        payload,
      });
    } catch (error) {
      this.logger.warn(`Falha ao gravar log de execucao: ${String(error)}`);
    }
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Node excedeu o timeout de ${timeoutMs}ms.`)),
        timeoutMs,
      );
      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error: unknown) => {
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }
}
