import { EventEmitter } from 'node:events';
import {
  NodeSandboxRunner,
  type SandboxCtxHandlers,
  type SandboxOptions,
} from './node-sandbox-runner';

/**
 * Testa a orquestracao de NodeSandboxRunner.run() (timeout, cleanup, RPC)
 * sem spawnar um worker_thread de verdade — o entrypoint real
 * (node-worker-entry.js) so existe compilado em dist/, e __dirname durante
 * ts-jest aponta pra src/, entao um Worker real nunca encontraria o arquivo
 * aqui. Mockar `node:worker_threads` isola exatamente o que este arquivo e
 * responsavel por: o CONTRATO com o worker (timeout duro, terminate(),
 * roteamento de RPC), nao o worker em si.
 */
class FakeWorker extends EventEmitter {
  static instances: FakeWorker[] = [];
  terminate = jest.fn();
  postMessage = jest.fn();

  constructor(
    public entryPath: string,
    public opts: unknown,
  ) {
    super();
    FakeWorker.instances.push(this);
  }
}

jest.mock('node:worker_threads', () => ({
  Worker: jest.fn(
    (entryPath: string, opts: unknown) => new FakeWorker(entryPath, opts),
  ),
}));

function noopHandlers(): SandboxCtxHandlers {
  return {
    log: jest.fn(),
    aiTelemetry: jest.fn(),
    getCredential: jest.fn(),
    callAgent: jest.fn(),
    searchKnowledge: jest.fn(),
    callMcpTool: jest.fn(),
    sendChatMessage: jest.fn(),
    requestApproval: jest.fn(),
  };
}

/** Molde padrao pros testes que so variam handlers/options. */
function runParams(overrides: {
  handlers?: SandboxCtxHandlers;
  options?: SandboxOptions;
  resumeData?: unknown;
} = {}) {
  return {
    nodeType: 'test.node',
    resolvedConfig: {},
    input: { foo: 'bar' },
    vars: {},
    resumeData: overrides.resumeData,
    handlers: overrides.handlers ?? noopHandlers(),
    options: overrides.options ?? { timeoutMs: 5_000, memoryLimitMb: 256 },
  };
}

beforeEach(() => {
  FakeWorker.instances = [];
});

describe('NodeSandboxRunner', () => {
  it('caminho feliz: resolve com o resultado da mensagem "result" e termina o worker', async () => {
    const runner = new NodeSandboxRunner();
    const promise = runner.run(runParams());

    const worker = FakeWorker.instances[0];
    worker.emit('message', {
      kind: 'result',
      ok: true,
      output: { done: true },
    });

    const result = await promise;
    expect(result).toEqual({
      kind: 'result',
      ok: true,
      output: { done: true },
    });
    expect(worker.terminate).toHaveBeenCalled();
  });

  it('H2-06: resumeData chega ao workerData quando presente', async () => {
    const runner = new NodeSandboxRunner();
    const promise = runner.run(
      runParams({ resumeData: { approved: true, comment: 'ok' } }),
    );

    const worker = FakeWorker.instances[0];
    expect(worker.opts).toMatchObject({
      workerData: { resumeData: { approved: true, comment: 'ok' } },
    });

    worker.emit('message', { kind: 'result', ok: true, output: null });
    await promise;
  });

  it('timeout duro: sem mensagem dentro de timeoutMs, resolve failureReason "timeout" e mata o worker', async () => {
    const runner = new NodeSandboxRunner();
    const promise = runner.run(
      runParams({ options: { timeoutMs: 20, memoryLimitMb: 256 } }),
    );

    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.failureReason).toBe('timeout');
    expect(result.error).toContain('20ms');
    const worker = FakeWorker.instances[0];
    expect(worker.terminate).toHaveBeenCalled();
  });

  it('erro do worker (crash) propaga failureReason "crash"', async () => {
    const runner = new NodeSandboxRunner();
    const promise = runner.run(runParams());

    const worker = FakeWorker.instances[0];
    worker.emit('error', new Error('segfault simulado'));

    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.failureReason).toBe('crash');
    expect(result.error).toBe('segfault simulado');
  });

  it('saida inesperada (exit != 0) sem resultado previo propaga failureReason "oom"', async () => {
    const runner = new NodeSandboxRunner();
    const promise = runner.run(runParams());

    const worker = FakeWorker.instances[0];
    worker.emit('exit', 137);

    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.failureReason).toBe('oom');
  });

  it('exit com codigo 0 APOS o resultado ja ter chegado nao sobrescreve o resultado', async () => {
    const runner = new NodeSandboxRunner();
    const promise = runner.run(runParams());

    const worker = FakeWorker.instances[0];
    worker.emit('message', { kind: 'result', ok: true, output: 1 });
    worker.emit('exit', 0);

    const result = await promise;
    expect(result).toEqual({ kind: 'result', ok: true, output: 1 });
  });

  it('RPC getCredential: chama o handler e responde via postMessage', async () => {
    const runner = new NodeSandboxRunner();
    const handlers = noopHandlers();
    (handlers.getCredential as jest.Mock).mockResolvedValue('segredo-123');

    const promise = runner.run(runParams({ handlers }));
    const worker = FakeWorker.instances[0];

    worker.emit('message', {
      kind: 'rpc',
      id: 1,
      method: 'getCredential',
      args: ['minha-credencial'],
    });
    // handleRpc e async — deixa o microtask (await handlers.getCredential) rodar.
    await new Promise((resolve) => setImmediate(resolve));

    expect(handlers.getCredential).toHaveBeenCalledWith('minha-credencial');
    expect(worker.postMessage).toHaveBeenCalledWith({
      kind: 'rpc-reply',
      id: 1,
      ok: true,
      result: 'segredo-123',
    });

    worker.emit('message', { kind: 'result', ok: true, output: null });
    await promise;
  });

  it('RPC com handler que lanca responde ok:false com a mensagem de erro', async () => {
    const runner = new NodeSandboxRunner();
    const handlers = noopHandlers();
    (handlers.getCredential as jest.Mock).mockRejectedValue(
      new Error('Credencial "x" nao encontrada neste workspace.'),
    );

    const promise = runner.run(runParams({ handlers }));
    const worker = FakeWorker.instances[0];

    worker.emit('message', {
      kind: 'rpc',
      id: 7,
      method: 'getCredential',
      args: ['x'],
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(worker.postMessage).toHaveBeenCalledWith({
      kind: 'rpc-reply',
      id: 7,
      ok: false,
      error: 'Credencial "x" nao encontrada neste workspace.',
    });

    worker.emit('message', { kind: 'result', ok: false, error: 'irrelevante' });
    await promise;
  });

  it('log e aiTelemetry sao fire-and-forget: nao respondem via postMessage', async () => {
    const runner = new NodeSandboxRunner();
    const handlers = noopHandlers();
    const promise = runner.run(runParams({ handlers }));
    const worker = FakeWorker.instances[0];

    worker.emit('message', {
      kind: 'rpc',
      id: 1,
      method: 'log',
      args: ['evt', { a: 1 }, 'info'],
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(handlers.log).toHaveBeenCalledWith('evt', { a: 1 }, 'info');
    expect(worker.postMessage).not.toHaveBeenCalled();

    worker.emit('message', { kind: 'result', ok: true, output: null });
    await promise;
  });

  it('resourceLimits do Worker refletem memoryLimitMb (maxOldGeneration) com piso de 16MB pra young gen', async () => {
    const runner = new NodeSandboxRunner();
    const promise = runner.run(
      runParams({ options: { timeoutMs: 5_000, memoryLimitMb: 32 } }),
    );
    const worker = FakeWorker.instances[0];
    expect(worker.opts).toMatchObject({
      resourceLimits: {
        maxOldGenerationSizeMb: 32,
        maxYoungGenerationSizeMb: 16,
      },
    });

    worker.emit('message', { kind: 'result', ok: true, output: null });
    await promise;
  });

  it('env do Worker e allowlist: nunca segredos, so as chaves conhecidas (fixas + prefixo AI_RATE_LIMIT_)', async () => {
    const originalEnv = { ...process.env };
    process.env.SECRETS_ENCRYPTION_KEY = 'chave-mestra-super-secreta';
    process.env.DATABASE_URL = 'postgresql://user:senha@host/db';
    process.env.OUTRA_VAR_QUALQUER = 'nao deveria vazar';
    process.env.AI_RATE_LIMIT_OPENAI_RPM = '42';
    process.env.REDIS_URL = 'redis://localhost:6379';

    try {
      const runner = new NodeSandboxRunner();
      const promise = runner.run(runParams());
      const worker = FakeWorker.instances[0];
      const env = (worker.opts as { env: Record<string, string> }).env;

      // O que teria vazado sem a allowlist — a checagem que importa de verdade.
      expect(env.SECRETS_ENCRYPTION_KEY).toBeUndefined();
      expect(env.DATABASE_URL).toBeUndefined();
      expect(env.OUTRA_VAR_QUALQUER).toBeUndefined();

      // O que a plataforma precisa pra nodes de IA continuarem funcionando.
      expect(env.AI_RATE_LIMIT_OPENAI_RPM).toBe('42');
      expect(env.REDIS_URL).toBe('redis://localhost:6379');

      worker.emit('message', { kind: 'result', ok: true, output: null });
      await promise;
    } finally {
      process.env = originalEnv;
    }
  });
});
