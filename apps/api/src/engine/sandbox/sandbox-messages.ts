import type { SuspendDescriptor } from '@workflow/nodes';

export interface SandboxRequest {
  nodeType: string;
  /** Config ja resolvida (resolveExpressions ja aplicado no thread principal). */
  config: unknown;
  input: unknown;
  vars: Record<string, unknown>;
  /** H2-06: dado da decisao na retomada pos-pausa; undefined na primeira passada. */
  resumeData?: unknown;
}

export type CtxRpcMethod =
  | 'log'
  | 'aiTelemetry'
  | 'getCredential'
  | 'callAgent'
  | 'searchKnowledge'
  | 'callMcpTool'
  | 'sendChatMessage'
  | 'requestApproval';

export interface CtxRpcCall {
  kind: 'rpc';
  id: number;
  method: CtxRpcMethod;
  args: unknown[];
}

export interface CtxRpcReply {
  kind: 'rpc-reply';
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface SandboxResult {
  kind: 'result';
  ok: boolean;
  output?: unknown;
  branches?: string[];
  varsPatch?: Record<string, unknown>;
  usage?: { tokens: number; model: string; costUsd: number };
  error?: string;
  /** So presente em falha do sandbox em si (nao de logica do node) — usado pra sandbox_timeouts_total. */
  failureReason?: 'timeout' | 'oom' | 'crash';
  /** H2-06: presente = o node pediu pra pausar (ok e sempre true junto). */
  suspend?: SuspendDescriptor;
}

export type SandboxToHostMessage = SandboxResult | CtxRpcCall;
