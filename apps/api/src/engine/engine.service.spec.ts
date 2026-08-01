import { Logger } from '@nestjs/common';
import type {
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
} from '@workflow/shared';
import { EngineService } from './engine.service';

// EngineService usa `new Logger(...)` direto (nao injetado) — sem app Nest
// no ar, isso escreve no console de verdade. So ruido cosmetico no output
// do teste; silenciado pra manter o CI legivel.
beforeAll(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});

/**
 * Testes de unidade do EngineService (H1.2) — sem NestJS TestingModule: as
 * dependencias reais (PrismaService, ExecutionEventsService, CryptoService,
 * NodeSandboxRunner, MetricsService...) abrem conexao com Postgres/Redis ou
 * exigem env vars no construtor. Aqui passamos mocks simples direto pro
 * construtor da classe — mais rapido e isola exatamente a logica do engine
 * (ondas, join, retry, onError, replay), sem depender de infra externa.
 *
 * `@workflow/nodes` e mockado por completo: `getNodeDefinition` so precisa
 * ser truthy (o motor nunca chama `.execute()` no thread principal — quem
 * roda o node de verdade e o NodeSandboxRunner, aqui tambem mockado) e
 * `resolveExpressions` vira passthrough (sintaxe de expressao ja e coberta
 * em packages/nodes/src/expressions.spec.ts — aqui o foco e wave/retry/
 * branch/replay, nao interpolacao de `{{ }}`).
 */
jest.mock('@workflow/nodes', () => ({
  getNodeDefinition: jest.fn((type: string) => ({ type })),
  resolveExpressions: jest.fn((value: unknown) => value),
}));
jest.mock('@workflow/ai', () => ({
  emitTelemetry: jest.fn(),
}));
// @workflow/shared resolve pro dist ESM (packages/shared/dist, "type":
// "module") — engine.service.ts importa ERROR_HANDLE em runtime (H2-05),
// incompativel com o ts-jest do api rodando em CJS. Mesma familia dos mocks
// acima.
jest.mock('@workflow/shared', () => ({ ERROR_HANDLE: 'error' }));

// Import DEPOIS do jest.mock (hoisted acima pelo babel-plugin-jest-hoist) —
// pega a referencia mockada, usada pra inspecionar com QUE config
// resolveExpressions foi chamado (describe "skip de expressoes: logic.code").
import { resolveExpressions } from '@workflow/nodes';

type SandboxResult = {
  kind: 'result';
  ok: boolean;
  output?: unknown;
  branches?: string[];
  varsPatch?: Record<string, unknown>;
  usage?: { tokens: number; model: string; costUsd: number };
  error?: string;
  failureReason?: 'timeout' | 'oom' | 'crash';
  /** H2-06 */
  suspend?: { reason: string; ref: string; label?: string };
};

function ok(
  output: unknown,
  extra: Partial<SandboxResult> = {},
): SandboxResult {
  return { kind: 'result', ok: true, output, ...extra };
}
function fail(
  error: string,
  extra: Partial<SandboxResult> = {},
): SandboxResult {
  return { kind: 'result', ok: false, error, ...extra };
}
/** H2-06: molde de um node que pede pra pausar. */
function suspend(
  ref: string,
  extra: Partial<SandboxResult> = {},
): SandboxResult {
  return {
    kind: 'result',
    ok: true,
    suspend: { reason: 'approval', ref },
    ...extra,
  };
}

function node(
  id: string,
  type: string,
  overrides: Partial<WorkflowNode> = {},
): WorkflowNode {
  return {
    id,
    type,
    category: 'logic',
    label: id,
    position: { x: 0, y: 0 },
    config: {},
    ...overrides,
  };
}

function edge(
  source: string,
  target: string,
  sourceHandle?: string,
): WorkflowEdge {
  return {
    id: `${source}->${target}${sourceHandle ? `:${sourceHandle}` : ''}`,
    source,
    target,
    sourceHandle,
  };
}

function graph(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowGraph {
  return { nodes, edges, viewport: { x: 0, y: 0, zoom: 1 } };
}

interface BuildOpts {
  runImpl: (
    nodeType: string,
    resolvedConfig: unknown,
    input: unknown,
    vars: Record<string, unknown>,
    resumeData?: unknown,
  ) => Promise<SandboxResult> | SandboxResult;
  execution: Record<string, unknown>;
  parentSteps?: Array<{
    nodeId: string;
    output: unknown;
    varsPatch: unknown;
    startedAt: Date;
    id: string;
  }>;
  /** H2-06: injeta o estado pausado devolvido por executionPausedState.findUnique. */
  pausedState?: Record<string, unknown> | null;
  /** H2-06: sobrescreve o default (claim sempre bem-sucedido) do updateMany atomico. */
  claimCount?: number;
}

function buildEngine(opts: BuildOpts) {
  const prisma = {
    execution: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(opts.execution),
      update: jest.fn().mockResolvedValue(undefined),
      // H2-06: claim atomico no inicio de run() — default sempre "ganha" a corrida.
      updateMany: jest
        .fn()
        .mockResolvedValue({ count: opts.claimCount ?? 1 }),
    },
    executionStep: {
      create: jest.fn().mockResolvedValue(undefined),
      findMany: jest.fn().mockResolvedValue(opts.parentSteps ?? []),
    },
    executionLog: { create: jest.fn().mockResolvedValue(undefined) },
    executionPausedState: {
      findUnique: jest.fn().mockResolvedValue(opts.pausedState ?? null),
      upsert: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    },
    conversation: { update: jest.fn().mockResolvedValue(undefined) },
    conversationMessage: { create: jest.fn().mockResolvedValue(undefined) },
    credential: { findFirst: jest.fn() },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const events = { emit: jest.fn() };
  const crypto = { decrypt: jest.fn() };
  const agents = { chat: jest.fn() };
  const knowledge = { search: jest.fn() };
  const mcp = { callTool: jest.fn() };
  const sandbox = {
    run: jest.fn(
      (params: {
        nodeType: string;
        resolvedConfig: unknown;
        input: unknown;
        vars: Record<string, unknown>;
        resumeData?: unknown;
      }) =>
        opts.runImpl(
          params.nodeType,
          params.resolvedConfig,
          params.input,
          params.vars,
          params.resumeData,
        ),
    ),
  };
  const metrics = {
    executionTotal: { inc: jest.fn() },
    executionDuration: { observe: jest.fn() },
    executionTokensTotal: { inc: jest.fn() },
    executionCostUsdTotal: { inc: jest.fn() },
    stepRetriesTotal: { inc: jest.fn() },
    sandboxTimeoutsTotal: { inc: jest.fn() },
    stepDuration: { observe: jest.fn() },
  };
  const alerts = {
    notifyExecutionFailed: jest.fn().mockResolvedValue(undefined),
  };
  const errorWorkflows = {
    dispatchForFailedExecution: jest.fn().mockResolvedValue(undefined),
  };
  const approvals = {
    create: jest.fn(),
    voidOpenApprovals: jest.fn().mockResolvedValue(undefined),
  };

  const engine = new EngineService(
    prisma as never,
    events as never,
    crypto as never,
    agents as never,
    knowledge as never,
    mcp as never,
    sandbox as never,
    metrics as never,
    alerts as never,
    errorWorkflows as never,
    approvals as never,
  );

  return {
    engine,
    prisma,
    approvals,
    events,
    crypto,
    agents,
    knowledge,
    mcp,
    sandbox,
    metrics,
    alerts,
    errorWorkflows,
  };
}

function buildExecution(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exec-1',
    triggerType: 'manual',
    inputPayload: { seed: true },
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    parentExecutionId: null,
    traceId: null,
    workflow: { id: 'wf-1', workspaceId: 'ws-1', name: 'Fluxo Teste' },
    version: {
      graph: graph(
        [node('trigger', 'test.trigger', { category: 'trigger' })],
        [],
      ),
    },
    ...overrides,
  };
}

describe('EngineService', () => {
  it('execucao simples: sucesso propaga status success e emite execution.completed', async () => {
    const execution = buildExecution({
      version: {
        graph: graph(
          [
            node('trigger', 'test.trigger', { category: 'trigger' }),
            node('A', 'test.a'),
          ],
          [edge('trigger', 'A')],
        ),
      },
    });
    const { engine, prisma, events, metrics } = buildEngine({
      execution,
      runImpl: () => ok({ done: true }),
    });

    await engine.run('exec-1');

    expect(prisma.execution.update).toHaveBeenLastCalledWith({
      where: { id: 'exec-1' },
      data: expect.objectContaining({ status: 'success', error: null }),
    });
    expect(events.emit).toHaveBeenCalledWith({
      type: 'execution.completed',
      executionId: 'exec-1',
      status: 'success',
    });
    expect(metrics.executionTotal.inc).toHaveBeenCalledWith({
      status: 'success',
      trigger: 'manual',
    });
  });

  it('falha (sem onError) marca overallStatus failed e emite execution.completed failed', async () => {
    const execution = buildExecution({
      version: {
        graph: graph(
          [
            node('trigger', 'test.trigger', { category: 'trigger' }),
            node('A', 'test.a'),
          ],
          [edge('trigger', 'A')],
        ),
      },
    });
    const { engine, prisma, events, alerts, errorWorkflows } = buildEngine({
      execution,
      runImpl: (nodeType) =>
        nodeType === 'test.a' ? fail('deu ruim') : ok({}),
    });

    await engine.run('exec-1');

    expect(prisma.execution.update).toHaveBeenLastCalledWith({
      where: { id: 'exec-1' },
      data: expect.objectContaining({ status: 'failed', error: 'deu ruim' }),
    });
    expect(events.emit).toHaveBeenCalledWith({
      type: 'execution.completed',
      executionId: 'exec-1',
      status: 'failed',
    });
    expect(alerts.notifyExecutionFailed).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      workflowId: 'wf-1',
      workflowName: 'Fluxo Teste',
      executionId: 'exec-1',
      error: 'deu ruim',
    });
    // H2-05: dispara o error workflow com o node que efetivamente falhou.
    expect(errorWorkflows.dispatchForFailedExecution).toHaveBeenCalledWith(
      'exec-1',
      { failedNodeId: 'A' },
    );
  });

  it('H2-05: falha tratada (onError:"branch") NAO dispara o error workflow — a execucao nao falhou', async () => {
    const execution = buildExecution({
      version: {
        graph: graph(
          [
            node('trigger', 'test.trigger', { category: 'trigger' }),
            node('A', 'test.a', { onError: 'branch' }),
            node('Fallback', 'test.fallback'),
          ],
          [edge('trigger', 'A'), edge('A', 'Fallback', 'error')],
        ),
      },
    });
    const { engine, errorWorkflows } = buildEngine({
      execution,
      runImpl: (nodeType) =>
        nodeType === 'test.a' ? fail('tratado') : ok({}),
    });

    await engine.run('exec-1');

    expect(errorWorkflows.dispatchForFailedExecution).not.toHaveBeenCalled();
  });

  it('H2-05: falha continuada (onError:"continue") NAO dispara o error workflow', async () => {
    const execution = buildExecution({
      version: {
        graph: graph(
          [
            node('trigger', 'test.trigger', { category: 'trigger' }),
            node('A', 'test.a', { onError: 'continue' }),
          ],
          [edge('trigger', 'A')],
        ),
      },
    });
    const { engine, errorWorkflows } = buildEngine({
      execution,
      runImpl: (nodeType) =>
        nodeType === 'test.a' ? fail('continuado') : ok({}),
    });

    await engine.run('exec-1');

    expect(errorWorkflows.dispatchForFailedExecution).not.toHaveBeenCalled();
  });

  it('sucesso NAO dispara alerta de falha', async () => {
    const execution = buildExecution({
      version: {
        graph: graph(
          [
            node('trigger', 'test.trigger', { category: 'trigger' }),
            node('A', 'test.a'),
          ],
          [edge('trigger', 'A')],
        ),
      },
    });
    const { engine, alerts } = buildEngine({
      execution,
      runImpl: () => ok({}),
    });

    await engine.run('exec-1');

    expect(alerts.notifyExecutionFailed).not.toHaveBeenCalled();
  });

  it('execucao em ondas: dois nodes independentes da mesma wave rodam concorrentemente (Promise.all, nao sequencial)', async () => {
    const execution = buildExecution({
      version: {
        graph: graph(
          [
            node('trigger', 'test.trigger', { category: 'trigger' }),
            node('A', 'test.a'),
            node('B', 'test.b'),
          ],
          [edge('trigger', 'A'), edge('trigger', 'B')],
        ),
      },
    });

    let concurrent = 0;
    let maxConcurrent = 0;
    const { engine, sandbox } = buildEngine({
      execution,
      runImpl: async (nodeType) => {
        if (nodeType === 'test.trigger') return ok({});
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((resolve) => setTimeout(resolve, 5));
        concurrent--;
        return ok({ from: nodeType });
      },
    });

    await engine.run('exec-1');

    // Se A e B rodassem sequencialmente (await um, depois o outro), o pico de
    // concorrencia seria 1 — so chega a 2 se o Promise.all da wave (run(),
    // ver comentario "execucao em ondas") de fato despachar os dois juntos.
    expect(maxConcurrent).toBe(2);
    const calledTypes = sandbox.run.mock.calls.map((call) => call[0].nodeType);
    expect(calledTypes).toEqual(
      expect.arrayContaining(['test.trigger', 'test.a', 'test.b']),
    );
  });

  it('branch de if/switch nao tomada: node fora de result.branches nao executa', async () => {
    const execution = buildExecution({
      version: {
        graph: graph(
          [
            node('trigger', 'test.trigger', { category: 'trigger' }),
            node('IF', 'test.if'),
            node('WhenTrue', 'test.true'),
            node('WhenFalse', 'test.false'),
          ],
          [
            edge('trigger', 'IF'),
            edge('IF', 'WhenTrue', 'true'),
            edge('IF', 'WhenFalse', 'false'),
          ],
        ),
      },
    });
    const { engine, sandbox } = buildEngine({
      execution,
      runImpl: (nodeType) => {
        if (nodeType === 'test.if') return ok({}, { branches: ['true'] });
        return ok({});
      },
    });

    await engine.run('exec-1');

    const calledTypes = sandbox.run.mock.calls.map((call) => call[0].nodeType);
    expect(calledTypes).toContain('test.true');
    expect(calledTypes).not.toContain('test.false');
  });

  it('logic.merge (join): so entra na proxima onda quando TODAS as edges de entrada completarem, recebendo array acumulado', async () => {
    const execution = buildExecution({
      version: {
        graph: graph(
          [
            node('trigger', 'test.trigger', { category: 'trigger' }),
            node('A', 'test.a'),
            node('B', 'test.b'),
            node('Merge', 'logic.merge'),
          ],
          [
            edge('trigger', 'A'),
            edge('trigger', 'B'),
            edge('A', 'Merge'),
            edge('B', 'Merge'),
          ],
        ),
      },
    });
    const { engine, sandbox } = buildEngine({
      execution,
      runImpl: (nodeType) => {
        if (nodeType === 'test.a') return ok({ from: 'A' });
        if (nodeType === 'test.b') return ok({ from: 'B' });
        return ok({ merged: true });
      },
    });

    await engine.run('exec-1');

    const mergeCall = sandbox.run.mock.calls.find(
      (call) => call[0].nodeType === 'logic.merge',
    );
    expect(mergeCall).toBeDefined();
    // Ordem deterministica: segue a ordem das edges no grafo (A antes de B),
    // nao a ordem de conclusao real do Promise.all.
    expect(mergeCall![0].input).toEqual([{ from: 'A' }, { from: 'B' }]);
  });

  it('retry com backoff: falha nas primeiras tentativas, sucesso na ultima propaga ok e conta stepRetriesTotal', async () => {
    const execution = buildExecution({
      version: {
        graph: graph(
          [
            node('trigger', 'test.trigger', { category: 'trigger' }),
            node('A', 'test.a', { retry: { attempts: 3, backoffMs: 1 } }),
          ],
          [edge('trigger', 'A')],
        ),
      },
    });
    let attempt = 0;
    const { engine, prisma, sandbox, metrics } = buildEngine({
      execution,
      runImpl: (nodeType) => {
        if (nodeType !== 'test.a') return ok({});
        attempt++;
        return attempt < 3
          ? fail(`falhou na tentativa ${attempt}`)
          : ok({ finalmente: true });
      },
    });

    await engine.run('exec-1');

    const aCalls = sandbox.run.mock.calls.filter(
      (call) => call[0].nodeType === 'test.a',
    );
    expect(aCalls).toHaveLength(3);
    expect(metrics.stepRetriesTotal.inc).toHaveBeenCalledTimes(2); // attempt 2 e 3
    expect(prisma.execution.update).toHaveBeenLastCalledWith({
      where: { id: 'exec-1' },
      data: expect.objectContaining({ status: 'success' }),
    });
  });

  describe('timeout do sandbox: logic.delay soma o ms do config ao timeout padrao', () => {
    // NODE_TIMEOUT_MS e const de modulo (le process.env no import do
    // engine.service.ts) — nao ha como sobrescrever no meio do spec, entao
    // asserta-se contra o default de 30_000 documentado em engine.service.ts.
    const DEFAULT_TIMEOUT_MS = 30_000;

    // sandbox.run() recebe um unico objeto de params (H2-06) — "options" e
    // um campo dele, nao mais um argumento posicional. Cast local, sem
    // alargar o mock compartilhado (usado por ~20 outros testes deste arquivo).
    function sandboxOptionsOf(
      call: unknown,
    ): { timeoutMs: number; memoryLimitMb: number } | undefined {
      return (
        call as [{ options: { timeoutMs: number; memoryLimitMb: number } }] | undefined
      )?.[0]?.options;
    }

    async function runDelay(config: Record<string, unknown>) {
      const execution = buildExecution({
        version: {
          graph: graph(
            [
              node('trigger', 'test.trigger', { category: 'trigger' }),
              node('D', 'logic.delay', { config }),
            ],
            [edge('trigger', 'D')],
          ),
        },
      });
      const { engine, sandbox } = buildEngine({
        execution,
        runImpl: () => ok({}),
      });

      await engine.run('exec-1');

      return sandbox.run.mock.calls.find(
        (call) => call[0].nodeType === 'logic.delay',
      );
    }

    it('logic.delay com ms numerico: timeout = ms + o padrao', async () => {
      const delayCall = await runDelay({ ms: 45_000 });
      expect(sandboxOptionsOf(delayCall)).toEqual(
        expect.objectContaining({ timeoutMs: 45_000 + DEFAULT_TIMEOUT_MS }),
      );
    });

    it('node comum (nao logic.delay): timeout continua o padrao', async () => {
      const execution = buildExecution({
        version: {
          graph: graph(
            [
              node('trigger', 'test.trigger', { category: 'trigger' }),
              node('A', 'test.a'),
            ],
            [edge('trigger', 'A')],
          ),
        },
      });
      const { engine, sandbox } = buildEngine({ execution, runImpl: () => ok({}) });

      await engine.run('exec-1');

      const aCall = sandbox.run.mock.calls.find(
        (call) => call[0].nodeType === 'test.a',
      );
      expect(sandboxOptionsOf(aCall)).toEqual(
        expect.objectContaining({ timeoutMs: DEFAULT_TIMEOUT_MS }),
      );
    });

    it('logic.delay com ms como string (vindo de expressao {{ }}): mesmo resultado que numerico', async () => {
      const delayCall = await runDelay({ ms: '45000' });
      expect(sandboxOptionsOf(delayCall)).toEqual(
        expect.objectContaining({ timeoutMs: 45_000 + DEFAULT_TIMEOUT_MS }),
      );
    });

    it('logic.delay acima do teto do schema (300_000): clampa em vez de propagar o valor bruto', async () => {
      const delayCall = await runDelay({ ms: 999_999 });
      expect(sandboxOptionsOf(delayCall)).toEqual(
        expect.objectContaining({ timeoutMs: 300_000 + DEFAULT_TIMEOUT_MS }),
      );
    });

    async function runCode(config: Record<string, unknown>) {
      const execution = buildExecution({
        version: {
          graph: graph(
            [
              node('trigger', 'test.trigger', { category: 'trigger' }),
              node('C', 'logic.code', { config }),
            ],
            [edge('trigger', 'C')],
          ),
        },
      });
      const { engine, sandbox } = buildEngine({
        execution,
        runImpl: () => ok({}),
      });

      await engine.run('exec-1');

      return sandbox.run.mock.calls.find(
        (call) => call[0].nodeType === 'logic.code',
      );
    }

    it('logic.code com timeoutMs numerico: timeout = timeoutMs + o padrao', async () => {
      const codeCall = await runCode({ code: 'return 1;', timeoutMs: 10_000 });
      expect(sandboxOptionsOf(codeCall)).toEqual(
        expect.objectContaining({ timeoutMs: 10_000 + DEFAULT_TIMEOUT_MS }),
      );
    });

    it('logic.code sem timeoutMs (ausente/invalido): cai no default do schema (5000)', async () => {
      const codeCall = await runCode({ code: 'return 1;' });
      expect(sandboxOptionsOf(codeCall)).toEqual(
        expect.objectContaining({ timeoutMs: 5_000 + DEFAULT_TIMEOUT_MS }),
      );
    });

    it('logic.code acima do teto (30_000): clampa em vez de propagar o valor bruto', async () => {
      const codeCall = await runCode({ code: 'return 1;', timeoutMs: 999_999 });
      expect(sandboxOptionsOf(codeCall)).toEqual(
        expect.objectContaining({ timeoutMs: 30_000 + DEFAULT_TIMEOUT_MS }),
      );
    });
  });

  describe('skip de expressoes: logic.code', () => {
    it('o campo "code" nao passa por resolveExpressions; "timeoutMs" continua sendo resolvido', async () => {
      const originalConfig = {
        code: 'return {{ $input.x }};',
        timeoutMs: '{{ $vars.t }}',
      };
      const execution = buildExecution({
        version: {
          graph: graph(
            [
              node('trigger', 'test.trigger', { category: 'trigger' }),
              node('C', 'logic.code', { config: originalConfig }),
            ],
            [edge('trigger', 'C')],
          ),
        },
      });
      const { engine, sandbox } = buildEngine({ execution, runImpl: () => ok({}) });

      await engine.run('exec-1');

      // resolveExpressions (mockado) nunca viu o campo "code" no objeto que
      // resolveu — so "timeoutMs" (o "rest" depois do destructure).
      const resolveCalls = (resolveExpressions as jest.Mock).mock.calls;
      const codeCall = resolveCalls.find(
        (call) => call[0] && 'timeoutMs' in call[0] && !('code' in call[0]),
      );
      expect(codeCall).toBeDefined();

      // O resolvedConfig que chega no sandbox.run tem "code" cru (identico
      // ao original, com {{ }} intacto) e "timeoutMs" presente.
      const sandboxCall = sandbox.run.mock.calls.find(
        (call) => call[0].nodeType === 'logic.code',
      );
      const resolvedConfig = sandboxCall?.[0]?.resolvedConfig as Record<
        string,
        unknown
      >;
      expect(resolvedConfig.code).toBe(originalConfig.code);
      expect(resolvedConfig.timeoutMs).toBe(originalConfig.timeoutMs);

      // node.config original nao foi mutado (e reutilizado entre tentativas de retry).
      expect(originalConfig.code).toBe('return {{ $input.x }};');
    });
  });

  describe('api.respond: determina o outputPayload da execucao (H2-04)', () => {
    function lastUpdateData(prisma: ReturnType<typeof buildEngine>['prisma']) {
      const calls = (prisma.execution.update as jest.Mock).mock.calls;
      return calls[calls.length - 1]?.[0]?.data as Record<string, unknown>;
    }

    it('sem respond: outputPayload continua sendo o lastOutput (regressao)', async () => {
      const execution = buildExecution({
        version: {
          graph: graph(
            [
              node('trigger', 'test.trigger', { category: 'trigger' }),
              node('n2', 'logic.log'),
            ],
            [edge('trigger', 'n2')],
          ),
        },
      });
      const { engine, prisma } = buildEngine({
        execution,
        runImpl: () => ok({ from: 'log' }),
      });

      await engine.run('exec-1');

      expect(lastUpdateData(prisma).outputPayload).toEqual({ from: 'log' });
    });

    it('respond no meio do fluxo: outputPayload e o output do respond, nao do node seguinte', async () => {
      const execution = buildExecution({
        version: {
          graph: graph(
            [
              node('trigger', 'test.trigger', { category: 'trigger' }),
              node('n2', 'api.respond', { category: 'api' }),
              node('n3', 'logic.log'),
            ],
            [edge('trigger', 'n2'), edge('n2', 'n3')],
          ),
        },
      });
      const { engine, prisma } = buildEngine({
        execution,
        runImpl: (nodeType) =>
          nodeType === 'api.respond' ? ok({ from: 'respond' }) : ok({ from: 'log-depois' }),
      });

      await engine.run('exec-1');

      expect(lastUpdateData(prisma).outputPayload).toEqual({ from: 'respond' });
    });

    it('fan-out: respond vence mesmo nao sendo o ultimo node da onda (nao-deterministico sem ele)', async () => {
      const execution = buildExecution({
        version: {
          graph: graph(
            [
              node('trigger', 'test.trigger', { category: 'trigger' }),
              node('n2', 'api.respond', { category: 'api' }),
              node('n3', 'logic.log'),
            ],
            [edge('trigger', 'n2'), edge('trigger', 'n3')],
          ),
        },
      });
      const { engine, prisma } = buildEngine({
        execution,
        runImpl: (nodeType) =>
          nodeType === 'api.respond' ? ok({ from: 'respond' }) : ok({ from: 'log-paralelo' }),
      });

      await engine.run('exec-1');

      // Sem o respond, o vencedor seria o ultimo item do array de resultados
      // da onda (aqui, o log) — a asserção prova que o respond de fato
      // sobrepoe isso.
      expect(lastUpdateData(prisma).outputPayload).toEqual({ from: 'respond' });
    });

    it('dois respond na mesma execucao: o primeiro vence, o segundo so gera warning', async () => {
      const execution = buildExecution({
        version: {
          graph: graph(
            [
              node('trigger', 'test.trigger', { category: 'trigger' }),
              node('n2', 'api.respond', { category: 'api' }),
              node('n3', 'api.respond', { category: 'api' }),
            ],
            [edge('trigger', 'n2'), edge('trigger', 'n3')],
          ),
        },
      });
      let call = 0;
      const { engine, prisma } = buildEngine({
        execution,
        runImpl: () => {
          call += 1;
          return ok({ from: `respond-${call}` });
        },
      });
      const warnSpy = Logger.prototype.warn as jest.Mock;
      warnSpy.mockClear();

      await engine.run('exec-1');

      const output = lastUpdateData(prisma).outputPayload as { from: string };
      expect(['respond-1', 'respond-2']).toContain(output.from);
      // So um dos dois pode ter vencido; o outro deve ter gerado o aviso.
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('api.respond duplicado'),
      );
    });

    it('respond devolvendo null: nao cai no lastOutput (guard `??` erraria isso)', async () => {
      const execution = buildExecution({
        version: {
          graph: graph(
            [
              node('trigger', 'test.trigger', { category: 'trigger' }),
              node('n2', 'api.respond', { category: 'api' }),
              node('n3', 'logic.log'),
            ],
            [edge('trigger', 'n2'), edge('n2', 'n3')],
          ),
        },
      });
      const { engine, prisma } = buildEngine({
        execution,
        runImpl: (nodeType) =>
          nodeType === 'api.respond' ? ok(null) : ok({ from: 'log-depois' }),
      });

      await engine.run('exec-1');

      // null -> outputPayload undefined (coluna nao escrita) — NUNCA o
      // output do node seguinte, que e o que `respondOutput ?? lastOutput`
      // erraria.
      expect(lastUpdateData(prisma).outputPayload).toBeUndefined();
    });

    it('respond num branch nao tomado: outputPayload cai no lastOutput normalmente', async () => {
      const execution = buildExecution({
        version: {
          graph: graph(
            [
              node('trigger', 'test.trigger', { category: 'trigger' }),
              node('n2', 'logic.if'),
              node('n3', 'api.respond', { category: 'api' }),
              node('n4', 'logic.log'),
            ],
            [
              edge('trigger', 'n2'),
              edge('n2', 'n3', 'true'),
              edge('n2', 'n4', 'false'),
            ],
          ),
        },
      });
      const { engine, prisma } = buildEngine({
        execution,
        runImpl: (nodeType) => {
          if (nodeType === 'logic.if') return ok({}, { branches: ['false'] });
          if (nodeType === 'api.respond') return ok({ from: 'respond-nao-deveria-rodar' });
          return ok({ from: 'log' });
        },
      });

      await engine.run('exec-1');

      expect(lastUpdateData(prisma).outputPayload).toEqual({ from: 'log' });
    });

    it('execucao failed depois do respond: status failed e outputPayload continua sendo o do respond', async () => {
      const execution = buildExecution({
        version: {
          graph: graph(
            [
              node('trigger', 'test.trigger', { category: 'trigger' }),
              node('n2', 'api.respond', { category: 'api' }),
              node('n3', 'test.a'),
            ],
            [edge('trigger', 'n2'), edge('n2', 'n3')],
          ),
        },
      });
      const { engine, prisma } = buildEngine({
        execution,
        runImpl: (nodeType) => {
          if (nodeType === 'api.respond') return ok({ from: 'respond' });
          if (nodeType === 'test.a') return fail('falhou depois');
          return ok({}); // trigger
        },
      });

      await engine.run('exec-1');

      const data = lastUpdateData(prisma);
      expect(data.status).toBe('failed');
      expect(data.outputPayload).toEqual({ from: 'respond' });
    });
  });

  it('onError:"branch" com edge "error" conectada (C3): falha tratada nao propaga failure e roteia pela edge de erro', async () => {
    const execution = buildExecution({
      version: {
        graph: graph(
          [
            node('trigger', 'test.trigger', { category: 'trigger' }),
            node('A', 'test.a', { onError: 'branch' }),
            node('Fallback', 'test.fallback'),
          ],
          [edge('trigger', 'A'), edge('A', 'Fallback', 'error')],
        ),
      },
    });
    const { engine, prisma, sandbox } = buildEngine({
      execution,
      runImpl: (nodeType) => {
        if (nodeType === 'test.a') return fail('falha tratada');
        return ok({ recebi: 'erro' });
      },
    });

    await engine.run('exec-1');

    expect(prisma.execution.update).toHaveBeenLastCalledWith({
      where: { id: 'exec-1' },
      data: expect.objectContaining({ status: 'success' }),
    });
    const fallbackCall = sandbox.run.mock.calls.find(
      (call) => call[0].nodeType === 'test.fallback',
    );
    expect(fallbackCall).toBeDefined();
    // O node de fallback recebe {error: <mensagem>} como input, roteado pela
    // edge "error" — ver engine.service.ts (handledFailures/outputForRouting).
    expect(fallbackCall![0].input).toEqual({ error: 'falha tratada' });
  });

  it('onError:"branch" SEM edge "error" conectada cai no fail-fast normal', async () => {
    const execution = buildExecution({
      version: {
        graph: graph(
          [
            node('trigger', 'test.trigger', { category: 'trigger' }),
            node('A', 'test.a', { onError: 'branch' }),
          ],
          [edge('trigger', 'A')],
        ),
      },
    });
    const { engine, prisma } = buildEngine({
      execution,
      runImpl: (nodeType) =>
        nodeType === 'test.a' ? fail('sem rota de erro') : ok({}),
    });

    await engine.run('exec-1');

    expect(prisma.execution.update).toHaveBeenLastCalledWith({
      where: { id: 'exec-1' },
      data: expect.objectContaining({
        status: 'failed',
        error: 'sem rota de erro',
      }),
    });
  });

  describe('logic.merge: flush parcial quando a onda esvazia (H2-05)', () => {
    it('If que so roteia um lado pro merge: merge executa com o array parcial (nao trava a execucao)', async () => {
      const execution = buildExecution({
        version: {
          graph: graph(
            [
              node('trigger', 'test.trigger', { category: 'trigger' }),
              node('If', 'logic.if'),
              node('Merge', 'logic.merge'),
            ],
            [
              edge('trigger', 'If'),
              edge('If', 'Merge', 'true'),
              edge('If', 'Merge', 'false'),
            ],
          ),
        },
      });
      const { engine, prisma, sandbox } = buildEngine({
        execution,
        runImpl: (nodeType) => {
          if (nodeType === 'logic.if') return ok({}, { branches: ['true'] });
          return ok({ merged: true });
        },
      });

      await engine.run('exec-1');

      const mergeCall = sandbox.run.mock.calls.find(
        (call) => call[0].nodeType === 'logic.merge',
      );
      expect(mergeCall).toBeDefined();
      // So a entrada 'true' chegou (a 'false' nunca dispara) — o merge
      // esperava 2 (incomingCount conta as duas edges) mas roda com 1.
      expect(mergeCall![0].input).toEqual([{}]);
      expect(prisma.execution.update).toHaveBeenLastCalledWith({
        where: { id: 'exec-1' },
        data: expect.objectContaining({ status: 'success' }),
      });
    });

    it('merges encadeados: o flush do primeiro alimenta o segundo, que tambem flusha', async () => {
      const execution = buildExecution({
        version: {
          graph: graph(
            [
              node('trigger', 'test.trigger', { category: 'trigger' }),
              node('If', 'logic.if'),
              node('MergeA', 'logic.merge'),
              node('MergeB', 'logic.merge'),
            ],
            [
              edge('trigger', 'If'),
              edge('If', 'MergeA', 'true'),
              edge('If', 'MergeA', 'false'),
              edge('MergeA', 'MergeB'),
              // MergeB tambem espera uma segunda entrada que nunca chega.
              edge('If', 'MergeB', 'nunca-dispara'),
            ],
          ),
        },
      });
      const { engine, prisma, sandbox } = buildEngine({
        execution,
        runImpl: (nodeType) => {
          if (nodeType === 'logic.if') return ok({}, { branches: ['true'] });
          return ok({ merged: true });
        },
      });

      await engine.run('exec-1');

      const mergeCalls = sandbox.run.mock.calls.filter(
        (call) => call[0].nodeType === 'logic.merge',
      );
      // MergeA flusha primeiro (recebe [{}]); o output dela alimenta MergeB,
      // que tambem fica curto (so a edge vinda de MergeA chega) e flusha por
      // sua vez (recebe [{merged: true}]) — os dois rodam, nenhum trava.
      expect(mergeCalls).toHaveLength(2);
      expect(mergeCalls[0]![0].input).toEqual([{}]);
      expect(mergeCalls[1]![0].input).toEqual([{ merged: true }]);
      expect(prisma.execution.update).toHaveBeenLastCalledWith({
        where: { id: 'exec-1' },
        data: expect.objectContaining({ status: 'success' }),
      });
    });
  });

  describe('onError:"continue" (H2-05)', () => {
    it('falha vira {error} e segue pelas edges normais; edge com handle nao roteia', async () => {
      const execution = buildExecution({
        version: {
          graph: graph(
            [
              node('trigger', 'test.trigger', { category: 'trigger' }),
              node('A', 'test.a', { onError: 'continue' }),
              node('B', 'test.b'),
              node('C', 'test.c'),
            ],
            [
              edge('trigger', 'A'),
              edge('A', 'B'),
              edge('A', 'C', 'algum-handle'),
            ],
          ),
        },
      });
      const { engine, prisma, sandbox } = buildEngine({
        execution,
        runImpl: (nodeType) => {
          if (nodeType === 'test.a') return fail('falha continuada');
          return ok({ recebi: 'ok' });
        },
      });

      await engine.run('exec-1');

      expect(prisma.execution.update).toHaveBeenLastCalledWith({
        where: { id: 'exec-1' },
        data: expect.objectContaining({ status: 'success' }),
      });
      const bCall = sandbox.run.mock.calls.find(
        (call) => call[0].nodeType === 'test.b',
      );
      expect(bCall).toBeDefined();
      // Mesmo dialeto de payload do caminho de erro (branch): {error: <mensagem>}.
      expect(bCall![0].input).toEqual({ error: 'falha continuada' });
      const cCall = sandbox.run.mock.calls.find(
        (call) => call[0].nodeType === 'test.c',
      );
      expect(cCall).toBeUndefined();
    });

    it('continue + retry: esgota as tentativas antes de tratar a falha', async () => {
      const execution = buildExecution({
        version: {
          graph: graph(
            [
              node('trigger', 'test.trigger', { category: 'trigger' }),
              node('A', 'test.a', {
                onError: 'continue',
                retry: { attempts: 3, backoffMs: 1 },
              }),
              node('B', 'test.b'),
            ],
            [edge('trigger', 'A'), edge('A', 'B')],
          ),
        },
      });
      const { engine, prisma, sandbox } = buildEngine({
        execution,
        runImpl: (nodeType) =>
          nodeType === 'test.a' ? fail('sempre falha') : ok({}),
      });

      await engine.run('exec-1');

      const aCalls = sandbox.run.mock.calls.filter(
        (call) => call[0].nodeType === 'test.a',
      );
      expect(aCalls).toHaveLength(3);
      expect(prisma.execution.update).toHaveBeenLastCalledWith({
        where: { id: 'exec-1' },
        data: expect.objectContaining({ status: 'success' }),
      });
    });

    it('trigger com onError:"continue" mantem o fail-fast (guard identico ao branch)', async () => {
      const execution = buildExecution({
        version: {
          graph: graph(
            [
              node('trigger', 'test.trigger', {
                category: 'trigger',
                onError: 'continue',
              }),
              node('A', 'test.a'),
            ],
            [edge('trigger', 'A')],
          ),
        },
      });
      const { engine, prisma } = buildEngine({
        execution,
        runImpl: (nodeType) =>
          nodeType === 'test.trigger' ? fail('trigger falhou') : ok({}),
      });

      await engine.run('exec-1');

      expect(prisma.execution.update).toHaveBeenLastCalledWith({
        where: { id: 'exec-1' },
        data: expect.objectContaining({
          status: 'failed',
          error: 'trigger falhou',
        }),
      });
    });

    it('continue sem edge de saida: execucao termina success sem downstream', async () => {
      const execution = buildExecution({
        version: {
          graph: graph(
            [
              node('trigger', 'test.trigger', { category: 'trigger' }),
              node('A', 'test.a', { onError: 'continue' }),
            ],
            [edge('trigger', 'A')],
          ),
        },
      });
      const { engine, prisma } = buildEngine({
        execution,
        runImpl: (nodeType) =>
          nodeType === 'test.a' ? fail('sem downstream') : ok({}),
      });

      await engine.run('exec-1');

      expect(prisma.execution.update).toHaveBeenLastCalledWith({
        where: { id: 'exec-1' },
        data: expect.objectContaining({ status: 'success' }),
      });
    });
  });

  it('replay parcial (C4): reconstitui $vars a partir do varsPatch dos ancestrais antes do node de partida', async () => {
    const parentGraph = graph(
      [
        node('trigger', 'test.trigger', { category: 'trigger' }),
        node('A', 'test.a'),
        node('B', 'test.b'),
      ],
      [edge('trigger', 'A'), edge('A', 'B')],
    );
    const execution = buildExecution({
      parentExecutionId: 'parent-exec-1',
      version: { graph: parentGraph },
    });
    const { engine, sandbox } = buildEngine({
      execution,
      parentSteps: [
        {
          nodeId: 'A',
          output: { out: 'A-output' },
          varsPatch: { counter: 5 },
          startedAt: new Date('2026-01-01T00:00:01.000Z'),
          id: 'step-a',
        },
      ],
      runImpl: () => ok({ b: 'ok' }),
    });

    await engine.run('exec-1', {
      replayFromNodeId: 'B',
      replayInput: { replay: true },
    });

    const bCall = sandbox.run.mock.calls.find(
      (call) => call[0].nodeType === 'test.b',
    );
    expect(bCall).toBeDefined();
    // `vars` e um campo do objeto de params de sandbox.run() — precisa
    // carregar o varsPatch reconstituido do ancestral A, nao um objeto vazio
    // (regressao do bug C4: replay parcial perdia $vars acumuladas antes do ponto).
    expect(bCall![0].vars).toEqual({ counter: 5 });
    // Input do node de partida do replay e o replayInput explicito, nao o
    // output do ancestral (esse so aparece via $node.A.* se referenciado).
    expect(bCall![0].input).toEqual({ replay: true });
  });

  describe('H2-06: pausa duravel (suspend/resume)', () => {
    function buildApprovalGraphExecution() {
      return buildExecution({
        version: {
          graph: graph(
            [
              node('trigger', 'test.trigger', { category: 'trigger' }),
              node('A', 'test.approval'),
            ],
            [edge('trigger', 'A')],
          ),
        },
      });
    }

    it('node suspende: persiste o frontier, marca waiting_approval e nunca grava status terminal', async () => {
      const execution = buildApprovalGraphExecution();
      const { engine, prisma, events, sandbox } = buildEngine({
        execution,
        runImpl: (nodeType) => {
          if (nodeType === 'test.approval') return suspend('approval-1');
          return ok({ triggered: true });
        },
      });

      await engine.run('exec-1');

      const approvalCall = sandbox.run.mock.calls.find(
        (call) => call[0].nodeType === 'test.approval',
      );
      expect(approvalCall).toBeDefined();
      expect(approvalCall![0].input).toEqual({ triggered: true });

      const upsertCall = (prisma.executionPausedState.upsert as jest.Mock)
        .mock.calls[0][0];
      expect(upsertCall.create.version).toBe(1);
      const persisted = upsertCall.create.state;
      expect(persisted.suspended).toEqual([
        expect.objectContaining({
          nodeId: 'A',
          ref: 'approval-1',
          reason: 'approval',
          input: { triggered: true },
        }),
      ]);
      // 'A' nao entra em `executed` no estado persistido — sem isso, o
      // restore encontraria a onda de retomada ja "executada" e sairia no
      // primeiro break do while, terminando a execucao como success
      // silencioso com o output antigo.
      expect(persisted.executed).toEqual(['trigger']);

      expect(prisma.execution.update).toHaveBeenCalledTimes(1);
      expect(prisma.execution.update).toHaveBeenCalledWith({
        where: { id: 'exec-1' },
        data: expect.objectContaining({
          status: 'waiting_approval',
          suspendedAt: expect.any(Date),
          elapsedMsBeforePause: expect.any(Number),
        }),
      });

      expect(events.emit).toHaveBeenCalledWith({
        type: 'execution.suspended',
        executionId: 'exec-1',
        nodeIds: ['A'],
      });
    });

    it('retomada: restaura o frontier, reexecuta o node suspenso com resumeData e conclui a execucao', async () => {
      const execution = buildApprovalGraphExecution();
      // Molda a linha que executionPausedState.findUnique devolveria de
      // verdade: `version` mora na LINHA (checado antes de tocar `state`) e
      // de novo dentro de `state` (o envelope do proprio PausedStateV1).
      const pausedState = {
        executionId: 'exec-1',
        version: 1,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        state: {
          version: 1,
          nodeOutputs: { trigger: { triggered: true } },
          vars: {},
          lastOutput: { triggered: true },
          respondOutput: null,
          hasRespondOutput: false,
          tokensTotal: 0,
          costUsdTotal: 0,
          executed: ['trigger'],
          mergeBuffers: [],
          suspended: [
            {
              nodeId: 'A',
              input: { triggered: true },
              ref: 'approval-1',
              reason: 'approval',
            },
          ],
        },
      };
      const { engine, prisma, sandbox } = buildEngine({
        execution,
        pausedState,
        runImpl: (nodeType, _config, _input, _vars, resumeData) => {
          if (nodeType === 'test.approval' && resumeData) {
            return ok({ approved: true }, { branches: ['approved'] });
          }
          return fail('nao deveria rodar sem resumeData');
        },
      });

      await engine.run('exec-1', {
        resume: { nodeId: 'A', data: { approved: true } },
      });

      expect(prisma.executionPausedState.findUnique).toHaveBeenCalledWith({
        where: { executionId: 'exec-1' },
      });

      const approvalCall = sandbox.run.mock.calls.find(
        (call) => call[0].nodeType === 'test.approval',
      );
      expect(approvalCall).toBeDefined();
      expect(approvalCall![0].resumeData).toEqual({ approved: true });
      // O input restaurado e o que o node tinha recebido ANTES de suspender
      // (persistido em `suspended[].input`), nao o inputPayload da execucao.
      expect(approvalCall![0].input).toEqual({ triggered: true });

      expect(prisma.executionPausedState.delete).toHaveBeenCalledWith({
        where: { executionId: 'exec-1' },
      });

      expect(prisma.execution.update).toHaveBeenLastCalledWith({
        where: { id: 'exec-1' },
        data: expect.objectContaining({ status: 'success' }),
      });
    });

    it('dois nodes suspendem na mesma onda: os dois entram no frontier persistido e no evento execution.suspended', async () => {
      const execution = buildExecution({
        version: {
          graph: graph(
            [
              node('trigger', 'test.trigger', { category: 'trigger' }),
              node('A', 'test.approvalA'),
              node('B', 'test.approvalB'),
            ],
            [edge('trigger', 'A'), edge('trigger', 'B')],
          ),
        },
      });
      const { engine, prisma, events, sandbox } = buildEngine({
        execution,
        runImpl: (nodeType) => {
          if (nodeType === 'test.approvalA') return suspend('ref-a');
          if (nodeType === 'test.approvalB') return suspend('ref-b');
          return ok({ triggered: true });
        },
      });

      await engine.run('exec-1');

      expect(sandbox.run.mock.calls).toHaveLength(3); // trigger, A, B

      const upsertCall = (prisma.executionPausedState.upsert as jest.Mock)
        .mock.calls[0][0];
      const persisted = upsertCall.create.state;
      expect(
        persisted.suspended.map((s: { nodeId: string }) => s.nodeId).sort(),
      ).toEqual(['A', 'B']);

      const suspendedEvent = (events.emit as jest.Mock).mock.calls
        .map((call) => call[0])
        .find((event) => event.type === 'execution.suspended');
      expect(suspendedEvent?.nodeIds.slice().sort()).toEqual(['A', 'B']);
    });

    it('Parallel -> Merge com um lado suspenso: o guard do flush impede o merge de rodar com a aprovacao pendente (regressao)', async () => {
      const execution = buildExecution({
        version: {
          graph: graph(
            [
              node('trigger', 'test.trigger', { category: 'trigger' }),
              node('A', 'test.approval'),
              node('B', 'test.b'),
              node('Merge', 'logic.merge'),
            ],
            [
              edge('trigger', 'A'),
              edge('trigger', 'B'),
              edge('A', 'Merge'),
              edge('B', 'Merge'),
            ],
          ),
        },
      });
      const { engine, prisma, sandbox } = buildEngine({
        execution,
        runImpl: (nodeType) => {
          if (nodeType === 'test.approval') return suspend('approval-1');
          if (nodeType === 'test.b') return ok({ from: 'B' });
          return ok({ triggered: true });
        },
      });

      await engine.run('exec-1');

      // O guard `suspendedAll.size === 0` no flush de merge e o que impede
      // isto: sem ele, o merge rodaria so com o lado B (o A suspenso nunca
      // chega no buffer) e a execucao terminaria "success" com a aprovacao
      // ainda pendente.
      const mergeCall = sandbox.run.mock.calls.find(
        (call) => call[0].nodeType === 'logic.merge',
      );
      expect(mergeCall).toBeUndefined();

      expect(prisma.execution.update).toHaveBeenCalledWith({
        where: { id: 'exec-1' },
        data: expect.objectContaining({ status: 'waiting_approval' }),
      });
      expect(prisma.execution.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'success' }),
        }),
      );

      const upsertCall = (prisma.executionPausedState.upsert as jest.Mock)
        .mock.calls[0][0];
      const persisted = upsertCall.create.state;
      expect(persisted.suspended).toEqual([
        expect.objectContaining({ nodeId: 'A', ref: 'approval-1' }),
      ]);
      // O buffer parcial do merge (so o lado B) sobrevive pausado — quando a
      // aprovacao for decidida, o merge ainda vai completar com os dois lados.
      expect(persisted.mergeBuffers).toEqual([['Merge', [{ from: 'B' }]]]);
    });

    it('restore com versao de estado incompativel: falha explicita, nunca interpreta as cegas', async () => {
      const execution = buildApprovalGraphExecution();
      // So o `version` da LINHA importa aqui — o codigo falha explicito antes
      // de tocar em `state` quando ele diverge do que este worker entende.
      const pausedState = {
        executionId: 'exec-1',
        version: 2, // versao futura desconhecida deste worker
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        state: {},
      };
      const { engine, prisma, sandbox } = buildEngine({
        execution,
        pausedState,
        runImpl: () => ok({}),
      });

      await engine.run('exec-1', { resume: { nodeId: 'A', data: {} } });

      // Nunca tenta reexecutar nada — falha antes de montar qualquer onda.
      expect(sandbox.run).not.toHaveBeenCalled();

      expect(prisma.executionPausedState.delete).toHaveBeenCalledWith({
        where: { executionId: 'exec-1' },
      });

      expect(prisma.execution.update).toHaveBeenLastCalledWith({
        where: { id: 'exec-1' },
        data: expect.objectContaining({
          status: 'failed',
          error: expect.stringContaining('Formato do estado pausado'),
        }),
      });
    });
  });
});
