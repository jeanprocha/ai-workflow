import { createElement, memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Check, X } from "lucide-react";
import type { NodeCategory, NodeRetryPolicy } from "@workflow/shared";
import { Pulse } from "@workflow/ui";
import { getNodeIcon } from "@/lib/node-icons";
import { getCatalogEntry } from "@/lib/node-catalog";
import { useDictionary, type Dictionary } from "@/lib/i18n";
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
  retry?: NodeRetryPolicy;
  status?: NodeRunStatus;
};

export type WorkflowFlowNode = Node<WorkflowNodeData, "workflowNode">;

function subtitleFor(
  nodeType: string,
  config: Record<string, unknown>,
  t: Dictionary["editor"]["workflowNode"],
): string | null {
  switch (nodeType) {
    case "trigger.webhook":
      return config.webhookId ? `POST /hooks/${config.webhookId}` : t.pendingSave;
    case "api.httpRequest":
      return config.url ? `${config.method ?? "GET"} ${config.url}` : null;
    case "logic.if":
      return config.left !== undefined
        ? `${String(config.left)} ${config.operator ?? "=="} ${String(config.right)}`
        : null;
    case "logic.log":
      return typeof config.message === "string" && config.message ? config.message : null;
    case "logic.delay":
      return `${String(config.ms ?? 1000)}ms`;
    case "api.graphql":
      return typeof config.url === "string" && config.url ? config.url : null;
    default:
      return typeof config.credential === "string" && config.credential
        ? t.connectionSubtitle(config.credential)
        : null;
  }
}

function StatusDot({ status, runningAriaLabel }: { status?: NodeRunStatus; runningAriaLabel: string }) {
  if (status === "running") return <Pulse variant="dot" size={8} ariaLabel={runningAriaLabel} />;
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

function outputHandleColor(output: string): string {
  if (output === "true") return "!bg-success";
  if (output === "false" || output === "default") return "!bg-border-strong";
  return "!bg-primary";
}

function WorkflowNodeComponent({ data, selected }: NodeProps<WorkflowFlowNode>) {
  const dict = useDictionary();
  const t = dict.editor.workflowNode;
  const entry = getCatalogEntry(data.nodeType);
  const isTrigger = data.category === "trigger";
  const outputs = entry?.outputs ?? ["default"];
  const subtitle = subtitleFor(data.nodeType, data.config, t);

  return (
    <div
      className={
        "relative w-60 rounded-lg border bg-popover text-popover-foreground shadow-sm transition-colors " +
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
        <StatusDot status={data.status} runningAriaLabel={dict.common.liveExecutionAriaLabel} />
      </div>

      {subtitle && (
        <div className="truncate border-t border-border px-3 py-1.5 font-mono text-xs text-muted-foreground">
          {subtitle}
        </div>
      )}

      {outputs.length <= 1 ? (
        <Handle type="source" position={Position.Right} className="!bg-border-strong" />
      ) : (
        <>
          {outputs.map((output, index) => (
            <Handle
              key={output}
              type="source"
              position={Position.Right}
              id={output}
              style={{ top: `${((index + 1) / (outputs.length + 1)) * 100}%` }}
              className={outputHandleColor(output)}
            />
          ))}
          <div className="pointer-events-none absolute inset-y-1.5 right-2.5 flex flex-col justify-between">
            {outputs.map((output) => (
              <span key={output} className="font-mono text-[9px] text-muted-foreground">
                {output}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export const WorkflowNode = memo(WorkflowNodeComponent);
export const NODE_TYPES = { workflowNode: WorkflowNode };
