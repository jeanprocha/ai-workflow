import type { WorkflowGraph } from "./graph.js";

export type WorkflowStatus = "draft" | "active" | "archived";

export interface Workflow {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  currentVersionId: string | null;
  /** H2-05: fluxo disparado quando ESTE fluxo falha. */
  errorWorkflowId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowVersion {
  id: string;
  workflowId: string;
  versionNumber: number;
  graph: WorkflowGraph;
  createdBy: string;
  createdAt: string;
}
