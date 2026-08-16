import { Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Prisma, LogLevel } from '@prisma/client';
import { getNodeDefinition, resolveExpressions } from '@workflow/nodes';
import type { SuspendDescriptor } from '@workflow/nodes';
import { emitTelemetry } from '@workflow/ai';
import { ERROR_HANDLE } from '@workflow/shared';
import type {
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
} from '@workflow/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionEventsService } from '../execution-events/execution-events.service';
import { CredentialsService } from '../credentials/credentials.service';
import { AgentsService } from '../agents/agents.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { McpService } from '../mcp/mcp.service';
import { NodeSandboxRunner } from './sandbox/node-sandbox-runner';
import { mergeContext } from '../observability/request-context';
import { MetricsService } from '../observability/metrics.service';
import { AlertsService } from '../alerts/alerts.service';
import { ErrorWorkflowService } from '../executions/error-workflow.service';
import { ApprovalsService } from '../approvals/approvals.service';

const NODE_TIMEOUT_MS = Number(process.env.NODE_SANDBOX_TIMEOUT_MS ?? 30_000);
const NODE_MEMORY_LIMIT_MB = Number(process.env.NODE_SANDBOX_MEMORY_MB ?? 256);
const DEFAULT_CHAT_ERROR_MESSAGE =
  'Desculpe, algo deu errado ao processar sua mensagem. Tente novamente em instantes.';

// O sandbox mata qualquer node em NODE_TIMEOUT_MS (30s), mas logic.delay
// aceita ate 300s de espera (packages/nodes/src/definitions/delay.ts) —
// qualquer delay > 30s falhava SEMPRE, com uma mensagem de timeout que nao
// explicava a causa real. O teto do clamp espelha o max do schema do node; a
// soma com NODE_TIMEOUT_MS preserva a margem padrao pro overhead do worker
// (spawn + import do registry + serializacao do resultado).
//
// O type esta hardcoded de proposito: um campo tipo `extraTimeoutFromConfig`
// em NodeDefinition viraria contrato publico do catalogo (e do build de
// packages/nodes) por causa de um unico node.
const DELAY_MAX_MS = 300_000;

// logic.code tem seu PROPRIO timeout (o vm mata loop sincrono nesse prazo,
// packages/nodes/src/definitions/code.ts) — o timeout do sandbox e so o
// backstop pro caso o codigo escape do vm timeout (ex.: loop async com
// await), daí a margem de NODE_TIMEOUT_MS por cima.
const CODE_MAX_TIMEOUT_MS = 30_000;
const CODE_DEFAULT_TIMEOUT_MS = 5_000;

function sandboxTimeoutFor(nodeType: string, resolvedConfig: unknown): number {
  if (nodeType === 'logic.code') {
    // O default do zod (5000) so e aplicado DENTRO do worker — se
    // timeoutMs vier ausente/invalido aqui (ex.: expressao nao resolvida),
    // cai no mesmo default do schema.
    const raw = Number(
      (resolvedConfig as { timeoutMs?: unknown } | null | undefined)?.timeoutMs,
    );
    const timeoutMs =
      Number.isFinite(raw) && raw > 0 ? raw : CODE_DEFAULT_TIMEOUT_MS;
    return (
      Math.min(Math.max(timeoutMs, 100), CODE_MAX_TIMEOUT_MS) + NODE_TIMEOUT_MS
    );
  }
  if (nodeType !== 'logic.delay') return NODE_TIMEOUT_MS;
  // Number(): `ms` pode chegar como string quando vem de uma expressao
  // {{ }} — o zod do node so valida la dentro do worker.
  const raw = Number(
    (resolvedConfig as { ms?: unknown } | null | undefined)?.ms,
  );
  const ms = Number.isFinite(raw)
    ? Math.min(Math.max(raw, 0), DELAY_MAX_MS)
    : 0;
  return ms + NODE_TIMEOUT_MS;
}

/** Formato de execution.inputPayload quando triggerType === 'chat' (montado pelo ChatService). */
interface ChatInputPayload {
  conversationId?: string;
  state?: Record<string, unknown>;
  [key: string]: unknown;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/**
 * Json do banco -> patch de $vars. Guarda contra array/escalar: o merge com
 * spread silenciosamente viraria chaves numericas em $vars se a coluna
 * tivesse lixo (nunca deveria, mas so gravamos objetos em varsPatch — ver
 * recordStep).
 */
function asVarsPatch(
  value: Prisma.JsonValue | null,
): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null;
}

const VALID_LOG_LEVELS: readonly LogLevel[] = [
  'debug',
  'info',
  'warn',
  'error',
];

/** `level` cruza o limite do worker_thread como string solta — nunca confiar sem checar. */
function normalizeLogLevel(level: string | undefined): LogLevel {
  return level && (VALID_LOG_LEVELS as readonly string[]).includes(level)
    ? (level as LogLevel)
    : 'info';
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
  /** H2-06: presente = o node pediu pra pausar aqui. */
  suspend?: SuspendDescriptor;
}

/**
 * H2-06: frontier persistido em ExecutionPausedState enquanto a execucao
 * esta `waiting_approval`. `version` protege contra o formato mudar entre um
 * deploy e outro — o restore falha explicito (nunca tenta interpretar as
 * cegas) quando `version !== PAUSED_STATE_VERSION`.
 */
const PAUSED_STATE_VERSION = 1;

/**
 * Teto do estado serializado — sem isso, um fluxo grande (nodeOutputs
 * acumulado de muitos nodes) gravaria um blob enorme em silencio ate virar
 * problema de performance/memoria descoberto so em producao.
 */
const MAX_PAUSED_STATE_BYTES = 1_000_000;

interface PausedStateSuspendedNode {
  nodeId: string;
  input: unknown;
  ref: string;
  reason: string;
}

interface PausedStateV1 {
  version: 1;
  nodeOutputs: Record<string, unknown>;
  vars: Record<string, unknown>;
  lastOutput: unknown;
  respondOutput: unknown;
  hasRespondOutput: boolean;
  tokensTotal: number;
  costUsdTotal: number;
  /** Set -> array: Json nao serializa Set/Map direto. */
  executed: string[];
  mergeBuffers: Array<[string, unknown[]]>;
  suspended: PausedStateSuspendedNode[];
}

/**
 * Engine de execucao (ADR-005 v3: cada node roda isolado num worker_thread via
 * NodeSandboxRunner — timeout duro e limite de memoria, nao apenas uma race de
 * Promise). Roda no processo do worker (apps/api/src/worker), nao na API.
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
    private readonly credentials: CredentialsService,
    private readonly agents: AgentsService,
    private readonly knowledge: KnowledgeService,
    private readonly mcp: McpService,
    private readonly sandbox: NodeSandboxRunner,
    private readonly metrics: MetricsService,
    private readonly alerts: AlertsService,
    private readonly errorWorkflows: ErrorWorkflowService,
    private readonly approvals: ApprovalsService,
  ) {}

  async run(
    executionId: string,
    options?: {
      replayFromNodeId?: string;
      replayInput?: unknown;
      /** H2-06: retomada pos-pausa — mesma Execution, node que estava suspenso + o dado da decisao. */
      resume?: { nodeId: string; data: unknown };
    },
  ): Promise<void> {
    // Claim atomico: cobre tanto o enfileiramento inicial (queued) quanto
    // toda retomada pos-pausa (waiting_approval). runStartedAt (nao
    // startedAt, que nunca muda) e o que o orphan recovery usa pra saber se
    // travou — sem isso, uma execucao retomada carregaria um startedAt de
    // dias atras e viraria elegivel a ser morta no proximo boot de worker.
    // count===0 significa que outro worker ja assumiu (job stalled
    // reentregue, ou o sweeper e uma decisao humana corrida entre si).
    const runStartedAt = new Date();
    const { count: claimed } = await this.prisma.execution.updateMany({
      where: {
        id: executionId,
        status: { in: ['queued', 'waiting_approval'] },
      },
      data: { status: 'running', runStartedAt },
    });
    if (claimed === 0) {
      this.logger.warn(
        `Execucao ${executionId} nao estava queued/waiting_approval ao iniciar — outro worker provavelmente ja assumiu.`,
      );
      return;
    }

    const execution = await this.prisma.execution.findUniqueOrThrow({
      where: { id: executionId },
      include: { version: true, workflow: true },
    });

    // Enriquece o contexto ja aberto pelo processor (runJobInContext, com
    // requestId/jobId/queue) com os dois campos que so existem depois de
    // carregar a execucao — daqui pra frente, todo log desta run() (inclusive
    // os do sandbox via ctx.log) carrega executionId e traceId.
    mergeContext({ executionId, traceId: execution.traceId ?? undefined });

    this.events.emit({ type: 'execution.started', executionId });
    this.logger.log(
      {
        executionId,
        workflowId: execution.workflow.id,
        triggerType: execution.triggerType,
      },
      'execution.started',
    );

    const workspaceId = execution.workflow.workspaceId;
    const graph = execution.version.graph as unknown as WorkflowGraph;
    const nodesById = new Map<string, WorkflowNode>(
      graph.nodes.map((node) => [node.id, node]),
    );
    const knownNodeIds = new Set(graph.nodes.map((node) => node.id));
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

    // Conversas: $vars comeca semeado do estado persistido da conversa (o
    // ChatService le a Conversation e embute o state atual no inputPayload
    // ao enfileirar) e, em execucao bem-sucedida, e regravado de volta no
    // final — e assim que o carrinho/etapa sobrevivem entre mensagens.
    const isChatExecution = execution.triggerType === 'chat';
    const chatInput = isChatExecution
      ? (execution.inputPayload as ChatInputPayload | null)
      : null;
    const conversationId = chatInput?.conversationId;

    const nodeOutputs: Record<string, unknown> = {};
    let vars: Record<string, unknown> =
      chatInput?.state && typeof chatInput.state === 'object'
        ? { ...chatInput.state }
        : {};
    let lastOutput: unknown = null;
    // H2-04: api.respond marca qual output e a resposta do endpoint
    // publicado — sem isso, "o resultado" seria o `lastOutput` (ultimo node
    // bem-sucedido da ultima onda), nao deterministico com fan-out. Flag
    // booleana, nao sentinela de valor: um respond que devolve `null`
    // (passthrough de input nulo) tem que vencer o lastOutput mesmo assim —
    // `respondOutput ?? lastOutput` erraria exatamente esse caso.
    let respondOutput: unknown = null;
    let hasRespondOutput = false;
    let overallStatus: 'success' | 'failed' = 'success';
    let failureError: string | null = null;
    // H2-05: qual node causou a falha fatal — vai no payload do error workflow
    // (ErrorWorkflowService). Fica null no caso "sem startNode" (trigger
    // ausente/replayFromNodeId invalido): nao ha node de fato pra apontar.
    let failedNodeId: string | null = null;
    let tokensTotal = 0;
    let costUsdTotal = 0;

    const startNode = options?.resume
      ? nodesById.get(options.resume.nodeId)
      : options?.replayFromNodeId
        ? nodesById.get(options.replayFromNodeId)
        : triggerNode;

    if (!startNode) {
      overallStatus = 'failed';
      failureError = options?.resume
        ? `Node ${options.resume.nodeId} nao encontrado no grafo ao retomar a execucao.`
        : options?.replayFromNodeId
          ? `Node ${options.replayFromNodeId} nao encontrado no grafo.`
          : 'O fluxo nao possui um node trigger.';
    } else {
      const executed = new Set<string>();
      const mergeBuffers = new Map<string, unknown[]>();
      // H2-06: nodes suspensos nesta execucao (o que esta retomando agora
      // fica de fora — ver bloco de resume abaixo) + o dado da decisao pro
      // node que esta sendo retomado.
      const suspendedAll = new Map<
        string,
        { input: unknown; ref: string; reason: string }
      >();
      const resumeDataByNode = new Map<string, unknown>();
      let resumeFailed = false;
      let resumeInput: unknown = options?.replayFromNodeId
        ? options.replayInput
        : execution.inputPayload;

      if (options?.resume) {
        // === Retomada pos-pausa: restaura o frontier de ExecutionPausedState
        // em vez de reconstruir a partir de ExecutionStep (replay) ou partir
        // do trigger (execucao nova). ===
        const paused = await this.prisma.executionPausedState.findUnique({
          where: { executionId },
        });
        if (!paused) {
          overallStatus = 'failed';
          failureError =
            'Estado de pausa nao encontrado ao retomar a execucao — a linha pode ja ter sido consumida por outra retomada.';
          resumeFailed = true;
        } else if (paused.version !== PAUSED_STATE_VERSION) {
          overallStatus = 'failed';
          failureError = `Formato do estado pausado desta execucao mudou (v${paused.version}, esperado v${PAUSED_STATE_VERSION}) — use "Tentar novamente" para reiniciar do zero.`;
          resumeFailed = true;
        } else {
          const state = paused.state as unknown as PausedStateV1;
          const target = state.suspended.find(
            (s) => s.nodeId === options.resume!.nodeId,
          );
          if (!target) {
            overallStatus = 'failed';
            failureError = `Estado de pausa inconsistente: o node "${options.resume.nodeId}" nao estava suspenso nesta execucao.`;
            resumeFailed = true;
          } else {
            Object.assign(nodeOutputs, state.nodeOutputs);
            vars = state.vars;
            lastOutput = state.lastOutput;
            respondOutput = state.respondOutput;
            hasRespondOutput = state.hasRespondOutput;
            tokensTotal = state.tokensTotal;
            costUsdTotal = state.costUsdTotal;
            for (const id of state.executed) executed.add(id);
            for (const [key, buffer] of state.mergeBuffers) {
              mergeBuffers.set(key, buffer);
            }
            // Os OUTROS nodes que ainda estao suspensos continuam suspensos —
            // se so um deles decidiu, a execucao pausa de novo ao final desta
            // onda (o link dos outros continua valendo, ninguem perde o
            // proprio link so porque um irmao decidiu primeiro).
            for (const suspended of state.suspended) {
              if (suspended.nodeId === target.nodeId) continue;
              suspendedAll.set(suspended.nodeId, {
                input: suspended.input,
                ref: suspended.ref,
                reason: suspended.reason,
              });
            }
            resumeDataByNode.set(target.nodeId, options.resume.data);
            resumeInput = target.input;
          }
        }
        // Apaga de qualquer forma (mesmo em falha de restore) — um estado
        // inconsistente nao deve ficar pra tras pra confundir uma proxima
        // tentativa; falhar a execucao aqui e explicito, o usuario usa
        // "Tentar novamente" pra reiniciar do zero.
        await this.prisma.executionPausedState
          .delete({ where: { executionId } })
          .catch(() => undefined);
      }

      // Partial replay: nodes upstream do node de partida nao sao re-executados —
      // seus outputs E o $vars acumulado sao reaproveitados da execucao
      // original (persistidos em ExecutionStep). O merge de varsPatch segue a
      // ordem de started_at (aproxima a ordem real de execucao entre ondas;
      // duas logic.setVariables na MESMA onda escrevendo a mesma chave ja
      // eram nao-deterministicas na execucao original via Promise.all, entao
      // o replay nao piora nada ali). Nodes com status 'failed' (inclusive
      // falha tratada por caminho de erro, onError:'branch') nunca entram
      // aqui — nao tem varsPatch por definicao (o execute() nao retornou) e
      // seu output tambem nao e reaproveitado. Replay de um replay so enxerga
      // o pai imediato (parentExecutionId), nao a cadeia inteira.
      if (
        !options?.resume &&
        options?.replayFromNodeId &&
        execution.parentExecutionId
      ) {
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
          select: {
            nodeId: true,
            output: true,
            varsPatch: true,
            startedAt: true,
            id: true,
          },
          orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
        });
        for (const step of parentSteps) {
          nodeOutputs[step.nodeId] = step.output;
          executed.add(step.nodeId);
          const patch = asVarsPatch(step.varsPatch);
          if (patch) vars = { ...vars, ...patch };
        }
      }

      let currentWave = new Map<string, unknown>(
        resumeFailed ? [] : [[startNode.id, resumeInput]],
      );

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
              conversationId,
              knownNodeIds,
              resumeData: resumeDataByNode.get(nodeId),
            });
          }),
        );

        let waveFailed = false;
        // Nodes cuja falha foi roteada pelo caminho de erro (onError:'branch'
        // com edge "error" conectada) em vez de derrubar a execucao — ver
        // comentario abaixo do loop de roteamento.
        const handledFailures = new Set<string>();
        // onError:'continue': mesma ideia, mas sem edge dedicada — a falha
        // segue pelas edges NORMAIS (sem sourceHandle) com o payload de erro,
        // como se o node tivesse tido sucesso.
        const continuedFailures = new Set<string>();
        // H2-06: input original de cada node desta onda — precisa sobreviver
        // pra quando o node suspende, ja que so vamos rotear/persistir esse
        // input muito depois (na retomada, ou nunca se a execucao morrer).
        const inputByNode = new Map(waveItems);
        for (const result of results) {
          if (result.ok && result.suspend) {
            // Pausa (H2-06): NAO toca nodeOutputs/lastOutput/respondOutput —
            // o node nao "aconteceu" do ponto de vista do resto do grafo ate
            // a decisao chegar. usage ainda conta (o node gastou token/custo
            // real antes de pedir a pausa).
            suspendedAll.set(result.nodeId, {
              input: inputByNode.get(result.nodeId),
              ref: result.suspend.ref,
              reason: result.suspend.reason,
            });
            if (result.usage) {
              tokensTotal += result.usage.tokens;
              costUsdTotal += result.usage.costUsd;
            }
            continue;
          }
          if (result.ok) {
            nodeOutputs[result.nodeId] = result.output;
            lastOutput = result.output;
            if (nodesById.get(result.nodeId)?.type === 'api.respond') {
              if (!hasRespondOutput) {
                respondOutput = result.output;
                hasRespondOutput = true;
              } else {
                // Primeiro vence. Com dois respond na mesma onda, o vencedor
                // e a ordem do array de resultados (ordem dos nodes no
                // grafo) — deterministico por grafo, mas arbitrario pra
                // quem monta o fluxo, daí o aviso.
                this.logger.warn(
                  `api.respond duplicado na execucao ${executionId} (node ${result.nodeId}) — o primeiro ja definiu a resposta.`,
                );
              }
            }
            if (result.varsPatch) vars = { ...vars, ...result.varsPatch };
            if (result.usage) {
              tokensTotal += result.usage.tokens;
              costUsdTotal += result.usage.costUsd;
            }
          } else {
            const failedNode = nodesById.get(result.nodeId);
            const hasErrorEdge = (outgoing.get(result.nodeId) ?? []).some(
              (edge) => edge.sourceHandle === ERROR_HANDLE,
            );
            if (
              failedNode?.onError === 'branch' &&
              failedNode.category !== 'trigger' &&
              hasErrorEdge
            ) {
              // Falha tratada: o ExecutionStep ja foi gravado como failed
              // (observabilidade) — aqui so evitamos propagar a falha pro
              // overallStatus, e o output vira o payload de erro roteado
              // pela edge "error" no loop abaixo. onError:'branch' SEM edge
              // "error" conectada cai no fail-fast normal (nunca engolir
              // erro em silencio).
              handledFailures.add(result.nodeId);
              nodeOutputs[result.nodeId] = {
                error: result.error ?? 'Erro desconhecido.',
              };
            } else if (
              failedNode?.onError === 'continue' &&
              failedNode.category !== 'trigger'
            ) {
              // Continue-on-error: o ExecutionStep fica failed (observabilidade),
              // mas a execucao segue pelas edges NORMAIS com o payload de erro —
              // sem precisar desenhar uma edge "error" dedicada. Mesmo dialeto
              // de payload do caminho de erro, pra quem consome downstream nao
              // ter que aprender dois formatos.
              continuedFailures.add(result.nodeId);
              nodeOutputs[result.nodeId] = {
                error: result.error ?? 'Erro desconhecido.',
              };
            } else {
              waveFailed = true;
              failureError = result.error ?? 'Erro desconhecido.';
              failedNodeId = result.nodeId;
            }
          }
        }

        if (waveFailed) {
          // Fail-fast (v1): uma falha em qualquer node da onda para a execucao
          // inteira, mesmo que branches irmas independentes tivessem sucesso.
          // Replay parcial a partir do node falho fica para a Fase 6; replay
          // tambem nao restaura o output de falhas tratadas por caminho de
          // erro (limitacao conhecida — steps failed nao sao reaproveitados).
          overallStatus = 'failed';
          break;
        }

        const nextWave = new Map<string, unknown>();
        for (const result of results) {
          const isHandledFailure = handledFailures.has(result.nodeId);
          const isContinuedFailure = continuedFailures.has(result.nodeId);
          // H2-06: node suspenso nao roteia NADA — nem edges normais nem de
          // erro. Sem este guard, `result.branches` undefined faria as
          // edges sem sourceHandle "passar" pelo filtro de baixo como se
          // fossem sucesso normal, disparando o resto do grafo com a
          // aprovacao ainda pendente.
          if (suspendedAll.has(result.nodeId)) continue;
          if (!result.ok && !isHandledFailure && !isContinuedFailure) continue;
          const outputForRouting =
            isHandledFailure || isContinuedFailure
              ? nodeOutputs[result.nodeId]
              : result.output;
          for (const edge of outgoing.get(result.nodeId) ?? []) {
            if (isHandledFailure) {
              // Falha tratada roteia so pela edge "error" — as edges normais
              // (sem handle ou com outro handle) nunca disparam na falha.
              if (edge.sourceHandle !== ERROR_HANDLE) continue;
            } else if (isContinuedFailure) {
              // Continue-on-error roteia so pelas edges NORMAIS (sem handle) —
              // como um sucesso sem branches. Um If/Switch que falhou com
              // continue nao tem branches pra decidir, entao nao roteia nada:
              // deterministico, sem adivinhar qual saida "venceria".
              if (edge.sourceHandle) continue;
            } else if (
              edge.sourceHandle &&
              !(result.branches ?? []).includes(edge.sourceHandle)
            ) {
              continue;
            }
            if (executed.has(edge.target)) continue;

            const targetNode = nodesById.get(edge.target);
            if (targetNode?.type === 'logic.merge') {
              const buffer = mergeBuffers.get(edge.target) ?? [];
              buffer.push(outputForRouting);
              mergeBuffers.set(edge.target, buffer);
              const required = incomingCount.get(edge.target) ?? 1;
              if (buffer.length >= required) {
                nextWave.set(edge.target, buffer.slice());
              }
            } else {
              nextWave.set(edge.target, outputForRouting);
            }
          }
        }

        // Um logic.merge com >=1 entrada bufferizada nao pode ficar pendurado
        // pra sempre quando o resto do grafo esvazia (If que so roteou um
        // lado, caminho de erro/continue que desvia uma perna do merge) —
        // antes disso, a onda seguinte vinha vazia, o while terminava e a
        // execucao gravava "success" com o merge e tudo depois dele nunca
        // executados, sem nenhum erro reportado. Roda so quando a onda normal
        // nao rendeu nada, e resolve merges encadeados iterativamente: cada
        // flush pode alimentar o proximo, e o proximo `while` reavalia.
        //
        // H2-06: `suspendedAll.size === 0` e o que impede este flush de
        // CONTORNAR uma aprovacao pendente — sem este guard, um Parallel com
        // um lado suspenso e outro bem-sucedido enche so 1 de 2 no buffer do
        // Merge, a onda "esvazia" (o lado suspenso nao roteia nada), e o
        // flush executaria o merge (e tudo depois) com a aprovacao ainda
        // pendente, terminando a execucao como "success" por engano.
        if (nextWave.size === 0 && suspendedAll.size === 0) {
          for (const [mergeId, buffer] of mergeBuffers) {
            if (executed.has(mergeId) || buffer.length === 0) continue;
            this.logger.warn(
              `logic.merge ${mergeId} esperava ${incomingCount.get(mergeId) ?? 1} entrada(s) mas recebeu ${buffer.length} — executando com as que chegaram (execution ${executionId}).`,
            );
            nextWave.set(mergeId, buffer.slice());
            mergeBuffers.delete(mergeId);
          }
        }

        currentWave = nextWave;
      }

      // H2-06: a onda drenou (ou o while nunca rodou, restore direto pra
      // onda vazia) com pelo menos um node suspenso e sem falha fatal —
      // persiste o frontier e sai ANTES do bloco final compartilhado
      // (que sempre grava um status terminal). "Drenar-e-pausar": os
      // irmaos do node suspenso numa mesma onda (ex.: Parallel) ja
      // terminaram normalmente antes de chegar aqui.
      if (suspendedAll.size > 0 && overallStatus === 'success') {
        const pausedState: PausedStateV1 = {
          version: PAUSED_STATE_VERSION,
          nodeOutputs,
          vars,
          lastOutput,
          respondOutput,
          hasRespondOutput,
          tokensTotal,
          costUsdTotal,
          // Invariante critica: `executed` marca TODOS os nodes da onda antes
          // de rodarem (linha do `for (const [nodeId] of waveItems)
          // executed.add(nodeId)`), entao um node suspenso ja esta ali. Sem
          // filtrar, o restore encontraria a onda de retomada inteira ja
          // "executada" e sairia no primeiro `break` do while — terminando
          // a execucao como success silencioso com o output antigo.
          executed: [...executed].filter((id) => !suspendedAll.has(id)),
          mergeBuffers: [...mergeBuffers],
          suspended: [...suspendedAll].map(([nodeId, s]) => ({
            nodeId,
            input: s.input,
            ref: s.ref,
            reason: s.reason,
          })),
        };
        try {
          await this.persistPausedState(executionId, pausedState);
        } catch (error) {
          overallStatus = 'failed';
          failureError =
            error instanceof Error
              ? error.message
              : 'Falha ao persistir o estado de pausa.';
          failedNodeId = [...suspendedAll.keys()][0] ?? null;
        }
        if (overallStatus === 'success') {
          const elapsedMs =
            (execution.elapsedMsBeforePause ?? 0) +
            (Date.now() - runStartedAt.getTime());
          await this.prisma.execution.update({
            where: { id: executionId },
            data: {
              status: 'waiting_approval',
              suspendedAt: new Date(),
              elapsedMsBeforePause: elapsedMs,
            },
          });
          this.events.emit({
            type: 'execution.suspended',
            executionId,
            nodeIds: [...suspendedAll.keys()],
          });
          this.logger.log(
            { executionId, nodeIds: [...suspendedAll.keys()] },
            'execution.suspended',
          );
          return;
        }
        // Falhou ao persistir: cai pro bloco final compartilhado abaixo como
        // uma falha normal (overallStatus/failureError ja setados acima).
      }
    }

    // api.respond, quando presente, vence o lastOutput (comentario na
    // declaracao de respondOutput acima). O guard de null->undefined
    // continua valendo pros dois: Prisma rejeita `null` cru em coluna Json
    // (exige Prisma.JsonNull), e `undefined` preserva o comportamento
    // historico de "nao escrever a coluna" quando nao ha output nenhum.
    const finalOutput = hasRespondOutput ? respondOutput : lastOutput;
    // H2-06: soma o tempo de execucao real (fora de pausas anteriores) —
    // sem isso, uma execucao que ficou dias em waiting_approval reportaria
    // esses dias inteiros como durationMs.
    const totalDurationMs =
      (execution.elapsedMsBeforePause ?? 0) +
      (Date.now() - runStartedAt.getTime());

    await this.prisma.execution.update({
      where: { id: executionId },
      data: {
        status: overallStatus,
        error: failureError,
        finishedAt: new Date(),
        durationMs: totalDurationMs,
        outputPayload:
          finalOutput === null || finalOutput === undefined
            ? undefined
            : toJson(finalOutput),
        tokensTotal,
        costUsd: costUsdTotal,
      },
    });

    // H2-06: fecha qualquer aprovacao ainda aberta desta execucao — sem
    // isto, um link de e-mail continuaria "valido" (pendente) na caixa de
    // alguem depois da execucao ja ter terminado por outro motivo (falha
    // fatal noutro node, replay, etc). So mexe em linhas com decidedAt
    // null; se nao houver nenhuma (caso comum: fluxo sem approval.human),
    // e um updateMany que afeta zero linhas.
    await this.approvals.voidOpenApprovals(executionId);

    if (conversationId) {
      if (overallStatus === 'success') {
        // So persiste em sucesso: uma falha no meio do fluxo nao deve gravar
        // um $vars parcial/inconsistente por cima do estado anterior valido.
        await this.prisma.conversation.update({
          where: { id: conversationId },
          data: { state: toJson(vars) },
        });
      } else {
        const chatConfig =
          triggerNode?.type === 'trigger.chat'
            ? (triggerNode.config as { errorMessage?: string })
            : undefined;
        await this.appendBotMessage(
          conversationId,
          chatConfig?.errorMessage || DEFAULT_CHAT_ERROR_MESSAGE,
          executionId,
        );
      }
    }

    this.events.emit({
      type: 'execution.completed',
      executionId,
      status: overallStatus,
    });

    const durationSeconds = totalDurationMs / 1000;
    const metricLabels = {
      status: overallStatus,
      trigger: execution.triggerType,
    };
    this.metrics.executionTotal.inc(metricLabels);
    this.metrics.executionDuration.observe(metricLabels, durationSeconds);
    if (tokensTotal > 0) this.metrics.executionTokensTotal.inc(tokensTotal);
    if (costUsdTotal > 0) this.metrics.executionCostUsdTotal.inc(costUsdTotal);

    const summary = {
      executionId,
      status: overallStatus,
      durationMs: totalDurationMs,
      tokensTotal,
      costUsd: costUsdTotal,
    };
    if (overallStatus === 'failed') {
      this.logger.error(
        { ...summary, error: failureError },
        'execution.completed',
      );
      // H1.4: erro cruza o worker_thread como string (nao um Error de
      // verdade — ver NodeStepResult), por isso o wrap aqui; sem SENTRY_DSN
      // configurada isso e no-op (ver instrument.ts).
      Sentry.captureException(new Error(failureError ?? 'Erro desconhecido.'), {
        tags: {
          executionId,
          workflowId: execution.workflow.id,
          workspaceId,
          triggerType: execution.triggerType,
        },
      });
      // H1.6: fire-and-forget — notifyExecutionFailed ja se protege por
      // dentro (nunca deve derrubar a execucao por causa de um alerta).
      void this.alerts.notifyExecutionFailed({
        workspaceId,
        workflowId: execution.workflow.id,
        workflowName: execution.workflow.name,
        executionId,
        error: failureError ?? 'Erro desconhecido.',
      });
      // H2-05: dispara Workflow.errorWorkflowId, se configurado. Caminho
      // separado do alerts (sem throttle) — fire-and-forget auto-protegido.
      void this.errorWorkflows.dispatchForFailedExecution(executionId, {
        failedNodeId,
      });
    } else {
      this.logger.log(summary, 'execution.completed');
    }
  }

  private async executeNodeWithRetry(params: {
    executionId: string;
    node: WorkflowNode;
    input: unknown;
    vars: Record<string, unknown>;
    nodeOutputs: Record<string, unknown>;
    workspaceId: string;
    conversationId?: string;
    knownNodeIds: ReadonlySet<string>;
    /** H2-06: presente so quando este node esta sendo retomado pos-pausa. */
    resumeData?: unknown;
  }): Promise<NodeStepResult> {
    const {
      executionId,
      node,
      input,
      vars,
      nodeOutputs,
      workspaceId,
      conversationId,
      knownNodeIds,
      resumeData,
    } = params;

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

    let resolvedConfig: unknown;
    try {
      const exprCtx = {
        input,
        vars,
        nodeOutputs,
        // $auth/$sig so existem dentro do execute do node HTTP (credencial lida
        // e timestamp calculado no proprio sandbox) — aqui, no thread principal,
        // essas expressoes tem que sobreviver intactas pra uma segunda passada
        // resolver depois (ver http-request.ts). Inocuo pra qualquer outro node,
        // que nunca tem esses campos no config.
        preserveRoots: ['$auth', '$sig'],
        // Um id inexistente aqui e quase sempre erro de digitacao na propria
        // expressao (ver ADR — UnknownNodeIdError) — sem isso, viraria
        // `undefined` em silencio e so estouraria la na frente, dentro do
        // execute do node (ex.: chat.reply gravando mensagem vazia).
        knownNodeIds,
      };
      // logic.code: `code` e JS literal do usuario, nao uma expressao —
      // resolveExpressions e cego a chaves (packages/nodes/src/expressions.ts)
      // e sua regex casaria com blocos JS reais (ex.: `if (a) {{ x = 1 }}`),
      // trocando-os por string vazia em silencio, ou mudando o tipo do campo
      // se o codigo inteiro for uma unica expressao. O codigo recebe
      // $input/$vars como globals do vm (code.ts), nao por interpolacao.
      // Destaca o campo antes de resolver e reanexa cru no resultado — nunca
      // mutar node.config, que e reutilizado entre tentativas de retry.
      if (
        node.type === 'logic.code' &&
        node.config &&
        typeof node.config === 'object'
      ) {
        const { code, ...rest } = node.config;
        const resolvedRest = resolveExpressions(rest, exprCtx) as Record<
          string,
          unknown
        >;
        resolvedConfig = { ...resolvedRest, code };
      } else {
        resolvedConfig = resolveExpressions(node.config, exprCtx);
      }
    } catch (error) {
      // Sem isso, o throw escaparia do Promise.all da wave (ver run()) sem
      // gravar nenhum step, deixando a execucao pendurada sem explicacao.
      const message =
        error instanceof Error ? error.message : 'Erro ao resolver expressao.';
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
      this.events.emit({
        type: 'step.completed',
        executionId,
        nodeId: node.id,
        status: 'failed',
        error: message,
      });
      return { nodeId: node.id, ok: false, error: message };
    }
    const sandboxTimeoutMs = sandboxTimeoutFor(node.type, resolvedConfig);
    const attempts = node.retry?.attempts ?? 1;
    const backoffMs = node.retry?.backoffMs ?? 0;

    let lastError = 'Erro desconhecido.';

    for (let attempt = 1; attempt <= attempts; attempt++) {
      this.events.emit({ type: 'step.started', executionId, nodeId: node.id });
      const startedAt = Date.now();

      const result = await this.sandbox.run({
        nodeType: node.type,
        resolvedConfig,
        input,
        vars,
        resumeData,
        handlers: {
          log: (event, payload, level) => {
            void this.recordLog(executionId, node.id, event, payload, level);
          },
          // Nodes ai.* rodam getProvider().chat() dentro do worker_thread do
          // sandbox (ADR-005) — modulo @workflow/ai isolado, sem o handler
          // registrado pelo AiTelemetryBridgeService. O evento cruza de volta
          // via RPC (ver node-worker-entry.ts) e e reemitido aqui, no
          // processo principal, onde o handler real esta registrado.
          aiTelemetry: (event) => emitTelemetry(event),
          getCredential: (name) => this.credentials.resolve(workspaceId, name),
          callAgent: async (agentId, message) => {
            const agentResult = await this.agents.chat(
              workspaceId,
              agentId,
              message,
            );
            return {
              content: agentResult.content,
              tokens: agentResult.tokensTotal,
              costUsd: agentResult.costUsd,
            };
          },
          searchKnowledge: async (knowledgeBaseId, query, opts) => {
            const knowledgeOpts = (opts ?? {}) as {
              topK?: number;
              threshold?: number;
            };
            const results = await this.knowledge.search(
              workspaceId,
              knowledgeBaseId,
              {
                query,
                topK: knowledgeOpts.topK,
                threshold: knowledgeOpts.threshold,
              },
            );
            return results.map((item) => ({
              documentName: item.documentName,
              content: item.content,
              similarity: item.similarity,
            }));
          },
          callMcpTool: (mcpServerId, toolName, args) =>
            this.mcp.callTool(
              workspaceId,
              mcpServerId,
              toolName,
              args as Record<string, unknown>,
            ),
          sendChatMessage: async (content) => {
            if (!conversationId) {
              throw new Error(
                'Chat Reply so funciona em fluxos disparados pelo trigger Chat.',
              );
            }
            await this.appendBotMessage(conversationId, content, executionId);
          },
          requestApproval: (params) =>
            this.approvals.create({
              executionId,
              workspaceId,
              nodeId: node.id,
              title: params.title,
              timeoutHours: params.timeoutHours,
              onTimeout: params.onTimeout,
            }),
        },
        options: {
          timeoutMs: sandboxTimeoutMs,
          memoryLimitMb: NODE_MEMORY_LIMIT_MB,
        },
      });

      const durationMs = Date.now() - startedAt;

      if (attempt > 1) {
        this.metrics.stepRetriesTotal.inc({ node_type: node.type });
      }
      if (result.failureReason) {
        this.metrics.sandboxTimeoutsTotal.inc({
          node_type: node.type,
          reason: result.failureReason,
        });
      }

      if (result.ok && result.suspend) {
        // H2-06: o node pediu pra pausar. Nunca passa pelo retry (o
        // execute() ja retornou sem lancar) — grava um step "aguardando",
        // NAO "success" (a decisao ainda nao chegou), e devolve ok:true com
        // o descritor pro loop de ondas decidir (nao roteia nada a partir
        // daqui ate a retomada). Sem `step.completed`: o step so "completa"
        // de verdade quando a decisao chegar (2a passada, no resume).
        await this.recordStep({
          executionId,
          node,
          status: 'waiting_approval',
          input,
          output: null,
          error: null,
          durationMs,
          attempt,
          usage: result.usage,
        });
        return {
          nodeId: node.id,
          ok: true,
          suspend: result.suspend,
          usage: result.usage,
        };
      }

      if (result.ok) {
        this.metrics.stepDuration.observe(
          { node_type: node.type, status: 'success' },
          durationMs / 1000,
        );
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
          varsPatch: result.varsPatch,
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
      }

      const message = result.error ?? 'Erro desconhecido.';
      lastError = message;
      this.metrics.stepDuration.observe(
        { node_type: node.type, status: 'failed' },
        durationMs / 1000,
      );
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

  /**
   * Ponto unico de saida de mensagem do bot — canal "web" so grava no banco
   * (a pagina publica le por polling); um canal externo futuro (WhatsApp,
   * Telegram...) faria a chamada ao provedor aqui tambem, num switch por
   * `conversation.channel`. Chamado tanto pelo RPC sendChatMessage quanto
   * pela mensagem de erro de execucao falha.
   */
  private async appendBotMessage(
    conversationId: string,
    content: string,
    executionId: string,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.conversationMessage.create({
        data: { conversationId, role: 'bot', content, executionId },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      }),
    ]);
  }

  private async recordStep(params: {
    executionId: string;
    node: WorkflowNode;
    /** H2-06: 'waiting_approval' registra a 1a passada de um node suspenso ("aguardando"); a retomada grava um 2o step 'success'/'failed'. */
    status: 'success' | 'failed' | 'waiting_approval';
    input: unknown;
    output: unknown;
    error: string | null;
    durationMs: number;
    attempt: number;
    usage?: NodeUsage;
    varsPatch?: Record<string, unknown>;
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
      varsPatch,
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
        varsPatch: varsPatch === undefined ? undefined : toJson(varsPatch),
        startedAt: new Date(Date.now() - durationMs),
        finishedAt: new Date(),
      },
    });

    if (status === 'failed') {
      this.logger.error(
        {
          executionId,
          nodeId: node.id,
          nodeType: node.type,
          attempt,
          error,
          durationMs,
        },
        'step.failed',
      );
    } else if (status === 'waiting_approval') {
      this.logger.debug(
        { executionId, nodeId: node.id, nodeType: node.type, attempt },
        'step.suspended',
      );
    } else {
      this.logger.debug(
        {
          executionId,
          nodeId: node.id,
          nodeType: node.type,
          attempt,
          durationMs,
        },
        'step.success',
      );
    }
  }

  /**
   * H2-06: grava o frontier da execucao pausada (upsert — uma retomada que
   * falha e re-suspende no mesmo node cairia aqui de novo). Lanca se o
   * estado serializado passar do teto — o chamador converte isso numa falha
   * normal da execucao em vez de gravar um blob gigante em silencio.
   */
  private async persistPausedState(
    executionId: string,
    state: PausedStateV1,
  ): Promise<void> {
    const serialized = JSON.stringify(state);
    const bytes = Buffer.byteLength(serialized, 'utf8');
    if (bytes > MAX_PAUSED_STATE_BYTES) {
      throw new Error(
        `Fluxo grande demais para pausar (estado serializado ${(bytes / 1_000_000).toFixed(1)}MB, limite ${(MAX_PAUSED_STATE_BYTES / 1_000_000).toFixed(1)}MB).`,
      );
    }
    await this.prisma.executionPausedState.upsert({
      where: { executionId },
      create: {
        executionId,
        version: PAUSED_STATE_VERSION,
        state: state as unknown as Prisma.InputJsonValue,
      },
      update: {
        version: PAUSED_STATE_VERSION,
        state: state as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async recordLog(
    executionId: string,
    nodeId: string,
    event: string,
    payload: unknown,
    level?: string,
  ) {
    const safeLevel = normalizeLogLevel(level);
    try {
      await this.prisma.executionLog.create({
        data: {
          executionId,
          nodeId,
          level: safeLevel,
          event,
          payload: payload === undefined ? undefined : toJson(payload),
        },
      });
      this.events.emit({
        type: 'log.created',
        executionId,
        nodeId,
        level: safeLevel,
        event,
        payload,
      });
    } catch (error) {
      this.logger.warn(`Falha ao gravar log de execucao: ${String(error)}`);
    }

    // Espelho em stdout estruturado, alem da tabela execution_logs — o node
    // que chamou ctx.log() fica visivel no log do servidor sem precisar
    // consultar o Postgres. `debug` fica fora do output por padrao
    // (LOG_LEVEL=info) para nao poluir com todo evento de sucesso.
    const line = { executionId, nodeId, event, payload };
    if (safeLevel === 'error') this.logger.error(line, 'execution.log');
    else if (safeLevel === 'warn') this.logger.warn(line, 'execution.log');
    else if (safeLevel === 'debug') this.logger.debug(line, 'execution.log');
    else this.logger.log(line, 'execution.log');
  }
}
