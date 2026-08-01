export type NodeCategory =
  | "trigger"
  | "logic"
  | "database"
  | "api"
  | "file"
  | "ai"
  | "communication";

export interface NodeRetryPolicy {
  attempts: number;
  backoffMs: number;
}

export interface WorkflowNode {
  id: string;
  type: string;
  category: NodeCategory;
  label: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
  /** Retry cross-cutting: aplicado pela engine, independente do tipo do node. */
  retry?: NodeRetryPolicy;
  /**
   * Caminho de erro cross-cutting: se "branch" e houver edge de saida com
   * sourceHandle ERROR_HANDLE, uma falha do node (apos retries) roteia por
   * essa edge em vez de derrubar a execucao. "continue" segue pelas edges
   * NORMAIS (sem sourceHandle) com o mesmo payload de erro, como se o node
   * tivesse tido sucesso — para quem so quer "nao trava o fluxo", sem desenhar
   * uma edge separada. Ausente/"fail" = fail-fast (v1).
   */
  onError?: "fail" | "branch" | "continue";
}

/** sourceHandle reservado para o caminho de erro (onError:'branch'). */
export const ERROR_HANDLE = "error";

export interface WorkflowEdge {
  id: string;
  source: string;
  sourceHandle?: string;
  target: string;
  targetHandle?: string;
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  viewport: { x: number; y: number; zoom: number };
}
