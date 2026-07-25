import { Injectable, Logger } from '@nestjs/common';
import { Worker } from 'node:worker_threads';
import * as path from 'node:path';
import type {
  CtxRpcCall,
  CtxRpcReply,
  SandboxResult,
  SandboxToHostMessage,
} from './sandbox-messages';

const ENTRY_PATH = path.join(__dirname, 'node-worker-entry.js');

export interface SandboxCtxHandlers {
  log: (event: string, payload: unknown, level?: string) => void;
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
}

export interface SandboxOptions {
  timeoutMs: number;
  memoryLimitMb: number;
}

/**
 * Isola a execucao de cada node num worker_thread (ADR-005 v3): timeout duro
 * (worker.terminate(), nao apenas uma race de Promise) + limite de heap via
 * resourceLimits. Callbacks de ctx (getCredential, callAgent, etc.) cruzam a
 * fronteira da thread por RPC via postMessage, ja que so o thread principal
 * tem acesso a Prisma/criptografia/outros services.
 */
@Injectable()
export class NodeSandboxRunner {
  private readonly logger = new Logger(NodeSandboxRunner.name);

  run(
    nodeType: string,
    resolvedConfig: unknown,
    input: unknown,
    vars: Record<string, unknown>,
    handlers: SandboxCtxHandlers,
    options: SandboxOptions,
  ): Promise<SandboxResult> {
    return new Promise((resolve) => {
      const worker = new Worker(ENTRY_PATH, {
        workerData: { nodeType, config: resolvedConfig, input, vars },
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
        finish({ kind: 'result', ok: false, error: error.message });
      });

      worker.on('exit', (code: number) => {
        if (!settled && code !== 0) {
          finish({
            kind: 'result',
            ok: false,
            error: `Sandbox encerrou inesperadamente (codigo ${code}) — possivel estouro de memoria.`,
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
