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

const NODE_TIMEOUT_MS = 30_000;

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

@Injectable()
export class EngineService {
  private readonly logger = new Logger(EngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ExecutionEventsService,
  ) {}

  async run(executionId: string): Promise<void> {
    const execution = await this.prisma.execution.findUniqueOrThrow({
      where: { id: executionId },
      include: { version: true },
    });

    await this.prisma.execution.update({
      where: { id: executionId },
      data: { status: 'running' },
    });
    this.events.emit({ type: 'execution.started', executionId });

    const graph = execution.version.graph as unknown as WorkflowGraph;
    const nodesById = new Map<string, WorkflowNode>(
      graph.nodes.map((node) => [node.id, node]),
    );
    const outgoing = new Map<string, WorkflowEdge[]>();
    for (const edge of graph.edges) {
      const list = outgoing.get(edge.source) ?? [];
      list.push(edge);
      outgoing.set(edge.source, list);
    }

    const triggerNode = graph.nodes.find((node) => node.category === 'trigger');

    const nodeOutputs: Record<string, unknown> = {};
    let vars: Record<string, unknown> = {};
    let lastOutput: unknown = null;
    let overallStatus: 'success' | 'failed' = 'success';
    let failureError: string | null = null;

    if (!triggerNode) {
      overallStatus = 'failed';
      failureError = 'O fluxo nao possui um node trigger.';
    } else {
      const queue: Array<{ nodeId: string; input: unknown }> = [
        { nodeId: triggerNode.id, input: execution.inputPayload },
      ];
      const executed = new Set<string>();

      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) break;
        const { nodeId, input } = next;
        if (executed.has(nodeId)) continue;
        executed.add(nodeId);

        const node = nodesById.get(nodeId);
        if (!node) continue;

        const definition = getNodeDefinition(node.type);
        if (!definition) {
          overallStatus = 'failed';
          failureError = `Node type desconhecido: ${node.type}`;
          await this.recordStep(
            executionId,
            node,
            'failed',
            input,
            null,
            failureError,
            0,
          );
          break;
        }

        const resolvedConfig = resolveExpressions(node.config, {
          input,
          vars,
          nodeOutputs,
        });
        this.events.emit({ type: 'step.started', executionId, nodeId });
        const startedAt = Date.now();

        try {
          const result = await this.withTimeout(
            Promise.resolve(
              definition.execute({
                config: resolvedConfig as never,
                input,
                vars,
                log: (event, payload) => {
                  void this.recordLog(executionId, nodeId, event, payload);
                },
              }),
            ),
            NODE_TIMEOUT_MS,
          );

          const durationMs = Date.now() - startedAt;
          nodeOutputs[nodeId] = result.output;
          lastOutput = result.output;
          if (result.varsPatch) vars = { ...vars, ...result.varsPatch };

          await this.recordStep(
            executionId,
            node,
            'success',
            input,
            result.output,
            null,
            durationMs,
          );
          this.events.emit({
            type: 'step.completed',
            executionId,
            nodeId,
            status: 'success',
            output: result.output,
          });

          for (const edge of outgoing.get(nodeId) ?? []) {
            if (edge.sourceHandle && edge.sourceHandle !== result.branch)
              continue;
            queue.push({ nodeId: edge.target, input: result.output });
          }
        } catch (error) {
          const durationMs = Date.now() - startedAt;
          const message =
            error instanceof Error ? error.message : String(error);
          await this.recordStep(
            executionId,
            node,
            'failed',
            input,
            null,
            message,
            durationMs,
          );
          this.events.emit({
            type: 'step.completed',
            executionId,
            nodeId,
            status: 'failed',
            error: message,
          });
          overallStatus = 'failed';
          failureError = message;
          break;
        }
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
      },
    });

    this.events.emit({
      type: 'execution.completed',
      executionId,
      status: overallStatus,
    });
  }

  private async recordStep(
    executionId: string,
    node: WorkflowNode,
    status: 'success' | 'failed',
    input: unknown,
    output: unknown,
    error: string | null,
    durationMs: number,
  ) {
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
