import { parentPort, workerData } from 'node:worker_threads';
import { getNodeDefinition, formatConfigError } from '@workflow/nodes';
import { setTelemetryHandler } from '@workflow/ai';
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

// @workflow/ai roda isolado dentro deste worker_thread (modulo proprio, sem
// estado compartilhado com o processo principal) — setTelemetryHandler() do
// AiTelemetryBridgeService (registrado no bootstrap do processo principal)
// nunca alcancaria as chamadas de getProvider().chat() feitas por nodes
// ai.* aqui dentro. Sem isto, o evento morreria no vazio (emitTelemetry()
// vira no-op sem handler) e as metricas ai_* nunca veriam execucao de nodes,
// so as chamadas feitas direto na API (Autocomplete/Copilot/Debugger).
// Fire-and-forget de volta ao thread principal, que reemite via
// emitTelemetry() na SUA propria instancia do modulo (essa sim com o
// handler real registrado).
setTelemetryHandler((event) => fireAndForget('aiTelemetry', [event]));

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

  // `graph.schema.ts` (save do fluxo) so confere que `node.type` existe no
  // catalogo — o `configSchema` de cada node nunca era de fato parseado em
  // cima do config salvo, nem aqui nem la. Parseando AQUI (config ja
  // resolvida, sem `{{ }}`, tipos reais) em vez de no save: no save os
  // campos ainda sao string de expressao crua, e um `timeoutMs: "{{ $vars.t }}"`
  // legitimo falharia contra um `z.number()`. Efeito colateral de graca:
  // aplica os defaults do zod que antes nunca chegavam na config real.
  const parsed = definition.configSchema.safeParse(data.config);
  if (!parsed.success) {
    const result: SandboxResult = {
      kind: 'result',
      ok: false,
      error: formatConfigError(data.nodeType, parsed.error),
    };
    port.postMessage(result);
    return;
  }

  try {
    const executionResult = await definition.execute({
      config: parsed.data,
      input: data.input,
      vars: data.vars,
      log: (event, payload, level) =>
        fireAndForget('log', [event, payload, level]),
      getCredential: (name) => callMain('getCredential', [name]),
      callAgent: (agentId, message) =>
        callMain('callAgent', [agentId, message]),
      searchKnowledge: (knowledgeBaseId, query, opts) =>
        callMain('searchKnowledge', [knowledgeBaseId, query, opts]),
      callMcpTool: (mcpServerId, toolName, args) =>
        callMain('callMcpTool', [mcpServerId, toolName, args]),
      sendChatMessage: (content) => callMain('sendChatMessage', [content]),
      requestApproval: (params) => callMain('requestApproval', [params]),
      resumeData: data.resumeData,
    });

    const result: SandboxResult = {
      kind: 'result',
      ok: true,
      output: executionResult.output,
      branches: executionResult.branches,
      varsPatch: executionResult.varsPatch,
      usage: executionResult.usage,
      // H2-06: sem esta linha, um node que devolve `suspend` teria o sinal
      // descartado em silencio aqui — a copia e campo a campo de proposito.
      suspend: executionResult.suspend,
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
