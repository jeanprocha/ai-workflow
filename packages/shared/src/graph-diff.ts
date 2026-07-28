import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from "./graph.js";

export interface NodeDiffEntry {
  status: "added" | "removed" | "changed" | "unchanged";
  before?: WorkflowNode;
  after?: WorkflowNode;
}

export interface EdgeDiffEntry {
  status: "added" | "removed" | "unchanged";
  edge: WorkflowEdge;
}

export interface GraphDiff {
  nodes: Record<string, NodeDiffEntry>;
  edges: Record<string, EdgeDiffEntry>;
  summary: { added: number; removed: number; changed: number };
}

function nodesEqual(a: WorkflowNode, b: WorkflowNode): boolean {
  return (
    a.type === b.type &&
    a.label === b.label &&
    JSON.stringify(a.config) === JSON.stringify(b.config) &&
    JSON.stringify(a.retry) === JSON.stringify(b.retry) &&
    (a.onError ?? "fail") === (b.onError ?? "fail")
  );
}

/** Compara dois grafos de versoes distintas do mesmo workflow, por id de node/edge. */
export function diffGraphs(before: WorkflowGraph, after: WorkflowGraph): GraphDiff {
  const beforeNodes = new Map(before.nodes.map((node) => [node.id, node]));
  const afterNodes = new Map(after.nodes.map((node) => [node.id, node]));
  const beforeEdges = new Map(before.edges.map((edge) => [edge.id, edge]));
  const afterEdges = new Map(after.edges.map((edge) => [edge.id, edge]));

  const nodes: Record<string, NodeDiffEntry> = {};
  let added = 0;
  let removed = 0;
  let changed = 0;

  for (const [id, node] of afterNodes) {
    const previous = beforeNodes.get(id);
    if (!previous) {
      nodes[id] = { status: "added", after: node };
      added++;
    } else if (!nodesEqual(previous, node)) {
      nodes[id] = { status: "changed", before: previous, after: node };
      changed++;
    } else {
      nodes[id] = { status: "unchanged", before: previous, after: node };
    }
  }
  for (const [id, node] of beforeNodes) {
    if (!afterNodes.has(id)) {
      nodes[id] = { status: "removed", before: node };
      removed++;
    }
  }

  const edges: Record<string, EdgeDiffEntry> = {};
  for (const [id, edge] of afterEdges) {
    edges[id] = { status: beforeEdges.has(id) ? "unchanged" : "added", edge };
  }
  for (const [id, edge] of beforeEdges) {
    if (!afterEdges.has(id)) edges[id] = { status: "removed", edge };
  }

  return { nodes, edges, summary: { added, removed, changed } };
}
