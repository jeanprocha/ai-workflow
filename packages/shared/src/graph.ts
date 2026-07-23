export type NodeCategory =
  | "trigger"
  | "logic"
  | "database"
  | "api"
  | "file"
  | "ai"
  | "communication";

export interface WorkflowNode {
  id: string;
  type: string;
  category: NodeCategory;
  label: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
}

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
