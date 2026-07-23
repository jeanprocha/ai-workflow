import type { WorkflowGraph } from "./graph";

export type WorkflowStatus = "draft" | "active" | "archived";

export interface Workflow {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  currentVersionId: string | null;
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
