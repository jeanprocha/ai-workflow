import { createElement, memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Check, X } from "lucide-react";
import type { NodeCategory } from "@workflow/shared";
import { Pulse } from "@workflow/ui";
import { getNodeIcon } from "@/lib/node-icons";
import { getCatalogEntry } from "@/lib/node-catalog";
import type { NodeRunStatus } from "@/hooks/use-execution-stream";

const CATEGORY_COLOR_VAR: Record<NodeCategory, string> = {
  trigger: "var(--node-trigger)",
  logic: "var(--node-logic)",
  database: "var(--node-database)",
  api: "var(--node-api)",
  file: "var(--node-file)",
  ai: "var(--node-ai)",
  communication: "var(--node-communication)",
};

export type WorkflowNodeData = {
  label: string;
  nodeType: string;
  category: NodeCategory;
  config: Record<string, unknown>;
  status?: NodeRunStatus;
};

export type WorkflowFlowNode = Node<WorkflowNodeData, "workflowNode">;

function subtitleFor(nodeType: string, config: Record<string, unknown>): string | null {
  switch (nodeType) {
    case "trigger.webhook":
      return config.webhookId ? `POST /hooks/${config.webhookId}` : "aguardando salvar...";
    case "api.httpRequest":
      return config.url ? `${config.method ?? "GET"} ${config.url}` : null;
    case "logic.if":
      return config.left !== undefined
        ? `${String(config.left)} ${config.operator ?? "=="} ${String(config.right)}`
        : null;
    case "logic.log":
      return typeof config.message === "string" && config.message ? config.message : null;
    default:
      return null;
  }
}

function StatusDot({ status }: { status?: NodeRunStatus }) {
  if (status === "running") return <Pulse variant="dot" size={8} />;
  if (status === "success")
    return (
      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-success-subtle text-success">
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
    );
  if (status === "failed")
    return (
      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-danger-subtle text-danger">
        <X className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
    );
  return null;
}

function WorkflowNodeComponent({ data, selected }: NodeProps<WorkflowFlowNode>) {
  const entry = getCatalogEntry(data.nodeType);
  const isTrigger = data.category === "trigger";
  const isIf = data.nodeType === "logic.if";
  const subtitle = subtitleFor(data.nodeType, data.config);

  return (
    <div
      className={
        "w-60 rounded-lg border bg-popover text-popover-foreground shadow-sm transition-colors " +
        (data.status === "running"
          ? "border-primary"
          : selected
            ? "border-primary"
            : "border-border")
      }
    >
      {!isTrigger && <Handle type="target" position={Position.Left} className="!bg-border-strong" />}

      <div className="flex items-center gap-2 px-3 py-2">
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded"
          style={{
            backgroundColor: `color-mix(in srgb, ${CATEGORY_COLOR_VAR[data.category]} 16%, transparent)`,
            color: CATEGORY_COLOR_VAR[data.category],
          }}
        >
          {createElement(getNodeIcon(entry?.icon ?? ""), {
            className: "h-3.5 w-3.5",
            strokeWidth: 1.5,
          })}
        </span>
        <span className="flex-1 truncate text-sm font-medium">{data.label}</span>
        <StatusDot status={data.status} />
      </div>

      {subtitle && (
        <div className="truncate border-t border-border px-3 py-1.5 font-mono text-xs text-muted-foreground">
          {subtitle}
        </div>
      )}

      {isIf ? (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            style={{ top: "35%" }}
            className="!bg-success"
          />
          <Handle
            type="source"
            position={Position.Right}
            id="false"
            style={{ top: "65%" }}
            className="!bg-danger"
          />
        </>
      ) : (
        <Handle type="source" position={Position.Right} className="!bg-border-strong" />
      )}
    </div>
  );
}

export const WorkflowNode = memo(WorkflowNodeComponent);
export const NODE_TYPES = { workflowNode: WorkflowNode };
