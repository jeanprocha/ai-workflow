import { Injectable, Logger } from '@nestjs/common';
import { Worker } from 'node:worker_threads';
import * as path from 'node:path';
import type { AiTelemetryEvent } from '@workflow/ai';
import type {
  CtxRpcCall,
  CtxRpcReply,
  SandboxResult,
  SandboxToHostMessage,
} from './sandbox-messages';

const ENTRY_PATH = path.join(__dirname, 'node-worker-entry.js');

export interface SandboxCtxHandlers {
  log: (event: string, payload: unknown, level?: string) => void;
  aiTelemetry: (event: AiTelemetryEvent) => void;
  getCredential: (name: string) => Promise<string>;
  callAgent: (
    agentId: string,
    message: string,
  ) => Promise<{ content: string; tokens: number; costUsd: number }>;
  searchKnowledge: (
    knowledgeBaseId: string,
    query: string,
    opts: unknown,
  ) => Promise<unknown>;
  callMcpTool: (
    mcpServerId: string,
    toolName: string,
    args: unknown,
  ) => Promise<unknown>;
  sendChatMessage: (content: string) => Promise<void>;
  /** H2-06: cria a pendencia de aprovacao e devolve o link publico de decisao. */
  requestApproval: (params: {
    title: string;
    timeoutHours: number;
    onTimeout: 'approve' | 'reject';
  }) => Promise<{ approvalId: string; url: string }>;
}

export interface SandboxOptions {
  timeoutMs: number;
  memoryLimitMb: number;
}

/**
 * Allowlist, nao denylist: um segredo novo nasce protegido por default (ex.:
 * SECRETS_ENCRYPTION_KEY, DATABASE_URL — sem isso, codigo dentro do worker
 * decifraria credenciais de qualquer workspace). Fixas: o que @workflow/ai
 * le DENTRO do worker (packages/ai/src/rate-limiter.ts:REDIS_URL,
 * providers/ollama.ts:OLLAMA_BASE_URL) + env de runtime/infra que o Node e
 * libs nativas (pg/mysql2/mongodb, fetch dos SDKs de IA) consomem
 * implicitamente — cair no allowlist so quebraria em producao (TLS custom,
 * egress proxy, timezone), nunca localmente.
 */
const ENV_ALLOWLIST = [
  'REDIS_URL',
  'OLLAMA_BASE_URL',
  'NODE_ENV',
  'TZ',
  'NODE_EXTRA_CA_CERTS',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
];

/** AI_RATE_LIMIT_<PROVIDER>_RPM e por provider (rate-limiter.ts) — chave dinamica, nao cabe em lista fixa. */
const ENV_ALLOWLIST_PREFIX = 'AI_RATE_LIMIT_';

function sandboxEnv(): NodeJS.Dict<string> {
  const env: NodeJS.Dict<string> = {};
  for (const key of ENV_ALLOWLIST) {
    if (process.env[key] != null) env[key] = process.env[key];
  }
  for (const key of Object.keys(process.env)) {
    if (key.startsWith(ENV_ALLOWLIST_PREFIX) && process.env[key] != null) {
      env[key] = process.env[key];
    }
  }
  return env;
}

/**
 * Isola a execucao de cada node num worker_thread (ADR-005 v3): timeout duro
 * (worker.terminate(), nao apenas uma race de Promise) + limite de heap via
 * resourceLimits + env allowlist (nunca o process.env inteiro). Callbacks de
 * ctx (getCredential, callAgent, etc.) cruzam a fronteira da thread por RPC
 * via postMessage, ja que so o thread principal tem acesso a
 * Prisma/criptografia/outros services.
 */
@Injectable()
export class NodeSandboxRunner {
  private readonly logger = new Logger(NodeSandboxRunner.name);

  run(params: {
    nodeType: string;
    resolvedConfig: unknown;
    input: unknown;
    vars: Record<string, unknown>;
    /** H2-06: presente so na retomada pos-pausa. */
    resumeData?: unknown;
    handlers: SandboxCtxHandlers;
    options: SandboxOptions;
  }): Promise<SandboxResult> {
    const { nodeType, resolvedConfig, input, vars, resumeData, handlers, options } = params;
    return new Promise((resolve) => {
      const worker = new Worker(ENTRY_PATH, {
        workerData: { nodeType, config: resolvedConfig, input, vars, resumeData },
        env: sandboxEnv(),
        resourceLimits: {
          maxOldGenerationSizeMb: options.memoryLimitMb,
          maxYoungGenerationSizeMb: Math.max(
            16,
            Math.floor(options.memoryLimitMb / 4),
          ),
        },
      });

      let settled = false;

      const finish = (result: SandboxResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        worker.removeAllListeners();
        void worker.terminate();
        resolve(result);
      };

      const timer = setTimeout(() => {
        finish({
          kind: 'result',
          ok: false,
          error: `Node excedeu o timeout de ${options.timeoutMs}ms (sandbox).`,
          failureReason: 'timeout',
        });
      }, options.timeoutMs);

      worker.on('message', (msg: SandboxToHostMessage) => {
        if (msg.kind === 'result') {
          finish(msg);
          return;
        }
        void this.handleRpc(worker, msg, handlers);
      });

      worker.on('error', (error: Error) => {
        finish({
          kind: 'result',
          ok: false,
          error: error.message,
          failureReason: 'crash',
        });
      });

      worker.on('exit', (code: number) => {
        if (!settled && code !== 0) {
          finish({
            kind: 'result',
            ok: false,
            error: `Sandbox encerrou inesperadamente (codigo ${code}) — possivel estouro de memoria.`,
            failureReason: 'oom',
          });
        }
      });
    });
  }

  private async handleRpc(
    worker: Worker,
    call: CtxRpcCall,
    handlers: SandboxCtxHandlers,
  ): Promise<void> {
    if (call.method === 'log') {
      try {
        handlers.log(
          call.args[0] as string,
          call.args[1],
          call.args[2] as string | undefined,
        );
      } catch (error) {
        this.logger.warn(`Falha ao processar log do sandbox: ${String(error)}`);
      }
      return; // fire-and-forget — sem reply
    }

    if (call.method === 'aiTelemetry') {
      try {
        handlers.aiTelemetry(call.args[0] as AiTelemetryEvent);
      } catch (error) {
        this.logger.warn(
          `Falha ao processar telemetria de IA do sandbox: ${String(error)}`,
        );
      }
      return; // fire-and-forget — sem reply
    }

    try {
      let result: unknown;
      switch (call.method) {
        case 'getCredential':
          result = await handlers.getCredential(call.args[0] as string);
          break;
        case 'callAgent':
          result = await handlers.callAgent(
            call.args[0] as string,
            call.args[1] as string,
          );
          break;
        case 'searchKnowledge':
          result = await handlers.searchKnowledge(
            call.args[0] as string,
            call.args[1] as string,
            call.args[2],
          );
          break;
        case 'callMcpTool':
          result = await handlers.callMcpTool(
            call.args[0] as string,
            call.args[1] as string,
            call.args[2],
          );
          break;
        case 'sendChatMessage':
          result = await handlers.sendChatMessage(call.args[0] as string);
          break;
        case 'requestApproval':
          result = await handlers.requestApproval(
            call.args[0] as {
              title: string;
              timeoutHours: number;
              onTimeout: 'approve' | 'reject';
            },
          );
          break;
      }
      const reply: CtxRpcReply = {
        kind: 'rpc-reply',
        id: call.id,
        ok: true,
        result,
      };
      worker.postMessage(reply);
    } catch (error) {
      const reply: CtxRpcReply = {
        kind: 'rpc-reply',
        id: call.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
      worker.postMessage(reply);
    }
  }
}
