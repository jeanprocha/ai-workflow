import { createElement, memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Check, X } from "lucide-react";
import { ERROR_HANDLE, type NodeCategory, type NodeRetryPolicy } from "@workflow/shared";
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
  onError?: "fail" | "branch" | "continue";
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
    case "trigger.chat":
      return typeof config.chatToken === "string" && config.chatToken
        ? `/chat/${config.chatToken}`
        : t.pendingSave;
    case "chat.reply":
      return typeof config.message === "string" && config.message ? config.message : null;
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
    case "logic.code":
      return `${String(config.timeoutMs ?? 5000)}ms`;
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
  if (output === ERROR_HANDLE) return "!bg-danger";
  if (output === "true") return "!bg-success";
  if (output === "false" || output === "default") return "!bg-border-strong";
  return "!bg-primary";
}

interface OutputHandleSpec {
  id?: string;
  label: string | null;
  colorClass: string;
}

/**
 * Rotulo exibido pra cada saida do node. O Switch tem so 4 casos + default
 * fixos no catalogo (["0","1","2","3","default"]) — "0".."3" sozinhos nao
 * dizem nada sobre o que aquele caminho testa, entao mostramos o valor do
 * caso configurado (ex.: "SP") em vez do indice cru, quando existir.
 */
function outputLabel(nodeType: string, output: string, config: Record<string, unknown>): string {
  if (nodeType === "logic.switch" && output !== "default") {
    const cases = (config.cases as unknown[]) ?? [];
    const caseValue = cases[Number(output)];
    if (typeof caseValue === "string" && caseValue.trim() !== "") return caseValue;
  }
  return output;
}

function WorkflowNodeComponent({ data, selected }: NodeProps<WorkflowFlowNode>) {
  const dict = useDictionary();
  const t = dict.editor.workflowNode;
  const entry = getCatalogEntry(data.nodeType);
  const isTrigger = data.category === "trigger";
  const outputs = entry?.outputs ?? ["default"];
  const subtitle = subtitleFor(data.nodeType, data.config, t);
  const errorEnabled = data.onError === "branch" && !isTrigger;

  // Handle "default" (saida unica, sem id — a onica forma de nao quebrar
  // edges existentes com sourceHandle undefined) nao ganha rotulo; nodes com
  // mais de uma saida (If/Switch) sempre tiveram rotulo. O caminho de erro,
  // quando habilitado, entra como uma saida extra id="error" no fim da
  // lista — sem tocar nos ids das saidas originais.
  const handleSpecs: OutputHandleSpec[] =
    outputs.length > 1
      ? outputs.map((output) => ({
          id: output,
          label: outputLabel(data.nodeType, output, data.config),
          colorClass: outputHandleColor(output),
        }))
      : [{ id: undefined, label: null, colorClass: "!bg-border-strong" }];
  if (errorEnabled) {
    handleSpecs.push({
      id: ERROR_HANDLE,
      label: t.errorHandleLabel,
      colorClass: outputHandleColor(ERROR_HANDLE),
    });
  }
  const showHandleLabels = handleSpecs.length > 1;
  // Os rotulos de saida ficam num container `absolute inset-y-1.5` que cobre
  // quase a altura inteira do card (ver abaixo) — sem altura minima
  // proporcional ao numero deles, um card so com header (~36px, sem
  // subtitulo) nao cabe os ~16px por rotulo que 4-5 saidas precisam, e o
  // texto vaza por baixo da borda.
  const minHeight = showHandleLabels ? handleSpecs.length * 18 + 16 : undefined;

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
      style={minHeight ? { minHeight: `${minHeight}px` } : undefined}
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
        <div
          className={
            "truncate border-t border-border px-3 py-1.5 font-mono text-xs text-muted-foreground " +
            // Com mais de uma saida, os rotulos flutuam por cima (absolute,
            // ver abaixo) do lado direito do card — sem essa margem, um
            // subtitulo longo (ex.: condicao do node If) teria seu texto
            // cortado bem embaixo dos rotulos, sobrepondo os dois de um
            // jeito ilegivel em vez de so truncar antes.
            (showHandleLabels ? "pr-20" : "")
          }
        >
          {subtitle}
        </div>
      )}

      {!showHandleLabels ? (
        <Handle type="source" position={Position.Right} className="!bg-border-strong" />
      ) : (
        <>
          {handleSpecs.map((spec, index) => (
            <Handle
              key={spec.id ?? "default"}
              type="source"
              position={Position.Right}
              id={spec.id}
              style={{ top: `${((index + 1) / (handleSpecs.length + 1)) * 100}%` }}
              className={spec.colorClass}
            />
          ))}
          <div className="pointer-events-none absolute inset-y-1.5 right-2.5 flex max-w-[64px] flex-col justify-between">
            {handleSpecs.map(
              (spec) =>
                spec.label !== null && (
                  <span
                    key={spec.id ?? "default"}
                    title={spec.label}
                    className="truncate font-mono text-xs leading-none text-muted-foreground"
                  >
                    {spec.label}
                  </span>
                ),
            )}
          </div>
        </>
      )}
    </div>
  );
}

export const WorkflowNode = memo(WorkflowNodeComponent);
export const NODE_TYPES = { workflowNode: WorkflowNode };
