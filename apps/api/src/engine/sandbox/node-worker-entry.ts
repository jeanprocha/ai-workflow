import { parentPort, workerData } from 'node:worker_threads';
import { getNodeDefinition } from '@workflow/nodes';
import type {
  SandboxRequest,
  CtxRpcCall,
  CtxRpcMethod,
  CtxRpcReply,
  SandboxResult,
} from './sandbox-messages.js';

/**
 * Roda DENTRO do worker_thread (ADR-005 v3). Como o node pode chamar credenciais,
 * agentes, busca semantica ou tools MCP — coisas que so existem no processo
 * principal (Prisma, criptografia, outros services) — cada chamada de ctx vira
 * uma mensagem RPC para o thread principal, que responde de volta. `log` e
 * fire-and-forget (nao espera reply).
 */

if (!parentPort) {
  throw new Error(
    'node-worker-entry.ts deve rodar dentro de um worker_thread.',
  );
}

const port = parentPort;
const data = workerData as SandboxRequest;

let rpcCounter = 0;
const pending = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>();

port.on('message', (msg: CtxRpcReply) => {
  if (msg.kind !== 'rpc-reply') return;
  const entry = pending.get(msg.id);
  if (!entry) return;
  pending.delete(msg.id);
  if (msg.ok) entry.resolve(msg.result);
  else entry.reject(new Error(msg.error ?? 'Erro no RPC do sandbox.'));
});

function callMain<T>(method: CtxRpcMethod, args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = ++rpcCounter;
    pending.set(id, {
      resolve: resolve,
      reject,
    });
    const call: CtxRpcCall = { kind: 'rpc', id, method, args };
    port.postMessage(call);
  });
}

function fireAndForget(method: CtxRpcMethod, args: unknown[]): void {
  const call: CtxRpcCall = { kind: 'rpc', id: 0, method, args };
  port.postMessage(call);
}

async function run(): Promise<void> {
  const definition = getNodeDefinition(data.nodeType);
  if (!definition) {
    const result: SandboxResult = {
      kind: 'result',
      ok: false,
      error: `Node type desconhecido: ${data.nodeType}`,
    };
    port.postMessage(result);
    return;
  }

  try {
    const executionResult = await definition.execute({
      config: data.config as never,
      input: data.input,
      vars: data.vars,
      log: (event, payload) => fireAndForget('log', [event, payload]),
      getCredential: (name) => callMain('getCredential', [name]),
      callAgent: (agentId, message) =>
        callMain('callAgent', [agentId, message]),
      searchKnowledge: (knowledgeBaseId, query, opts) =>
        callMain('searchKnowledge', [knowledgeBaseId, query, opts]),
      callMcpTool: (mcpServerId, toolName, args) =>
        callMain('callMcpTool', [mcpServerId, toolName, args]),
    });

    const result: SandboxResult = {
      kind: 'result',
      ok: true,
      output: executionResult.output,
      branches: executionResult.branches,
      varsPatch: executionResult.varsPatch,
      usage: executionResult.usage,
    };
    port.postMessage(result);
  } catch (error) {
    const result: SandboxResult = {
      kind: 'result',
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    port.postMessage(result);
  }
}

void run();
