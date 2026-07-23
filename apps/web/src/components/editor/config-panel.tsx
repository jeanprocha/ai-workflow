import { createElement } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { getCatalogEntry } from "@/lib/node-catalog";
import { getNodeIcon } from "@/lib/node-icons";
import type { WorkflowFlowNode } from "./workflow-node";

export interface ConfigPanelProps {
  node: WorkflowFlowNode;
  onChange: (config: Record<string, unknown>) => void;
  onClose: () => void;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function HttpRequestFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const headers = (config.headers as Record<string, string>) ?? {};
  const headerEntries = Object.entries(headers);

  function setHeader(index: number, key: string, value: string) {
    const next = [...headerEntries];
    next[index] = [key, value];
    onChange({ ...config, headers: Object.fromEntries(next) });
  }

  function removeHeader(index: number) {
    const next = headerEntries.filter((_, i) => i !== index);
    onChange({ ...config, headers: Object.fromEntries(next) });
  }

  return (
    <>
      <Field label="Metodo">
        <select
          value={(config.method as string) ?? "GET"}
          onChange={(event) => onChange({ ...config, method: event.target.value })}
          className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm"
        >
          {["GET", "POST", "PUT", "PATCH", "DELETE"].map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>
      </Field>

      <Field label="URL" hint="Suporta expressoes, ex: {{ $input.url }}">
        <Input
          value={(config.url as string) ?? ""}
          onChange={(event) => onChange({ ...config, url: event.target.value })}
          placeholder="https://api.exemplo.com/recurso"
        />
      </Field>

      <Field label="Headers">
        <div className="space-y-1.5">
          {headerEntries.map(([key, value], index) => (
            <div key={index} className="flex gap-1.5">
              <Input
                value={key}
                onChange={(event) => setHeader(index, event.target.value, value)}
                placeholder="Nome"
                className="flex-1"
              />
              <Input
                value={value}
                onChange={(event) => setHeader(index, key, event.target.value)}
                placeholder="Valor"
                className="flex-1"
              />
              <Button variant="ghost" size="icon-sm" onClick={() => removeHeader(index)}>
                <X className="h-3.5 w-3.5" strokeWidth={1.5} />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChange({ ...config, headers: { ...headers, "": "" } })}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
            Adicionar header
          </Button>
        </div>
      </Field>

      <Field label="Timeout (ms)">
        <Input
          type="number"
          value={(config.timeoutMs as number) ?? 10000}
          onChange={(event) => onChange({ ...config, timeoutMs: Number(event.target.value) })}
        />
      </Field>
    </>
  );
}

function IfFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  return (
    <>
      <Field label="Valor esquerdo" hint="Ex: {{ $node.n2.status }}">
        <Input
          value={String(config.left ?? "")}
          onChange={(event) => onChange({ ...config, left: event.target.value })}
        />
      </Field>
      <Field label="Operador">
        <select
          value={(config.operator as string) ?? "=="}
          onChange={(event) => onChange({ ...config, operator: event.target.value })}
          className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm"
        >
          {["==", "!=", ">", "<", ">=", "<=", "contains"].map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Valor direito">
        <Input
          value={String(config.right ?? "")}
          onChange={(event) => onChange({ ...config, right: event.target.value })}
        />
      </Field>
    </>
  );
}

function SetVariablesFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const assignments = (config.assignments as Array<{ key: string; value: unknown }>) ?? [];

  function update(index: number, patch: Partial<{ key: string; value: unknown }>) {
    const next = assignments.map((assignment, i) =>
      i === index ? { ...assignment, ...patch } : assignment,
    );
    onChange({ ...config, assignments: next });
  }

  return (
    <Field label="Variaveis">
      <div className="space-y-1.5">
        {assignments.map((assignment, index) => (
          <div key={index} className="flex gap-1.5">
            <Input
              value={assignment.key}
              onChange={(event) => update(index, { key: event.target.value })}
              placeholder="chave"
              className="flex-1"
            />
            <Input
              value={String(assignment.value ?? "")}
              onChange={(event) => update(index, { value: event.target.value })}
              placeholder="valor"
              className="flex-1"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onChange({ ...config, assignments: assignments.filter((_, i) => i !== index) })}
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange({ ...config, assignments: [...assignments, { key: "", value: "" }] })}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
          Adicionar variavel
        </Button>
      </div>
    </Field>
  );
}

export function ConfigPanel({ node, onChange, onClose }: ConfigPanelProps) {
  const entry = getCatalogEntry(node.data.nodeType);
  const config = node.data.config;

  return (
    <aside className="flex h-full w-96 shrink-0 flex-col border-l border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          {createElement(getNodeIcon(entry?.icon ?? ""), {
            className: "h-4 w-4 text-muted-foreground",
            strokeWidth: 1.5,
          })}
          <div>
            <p className="text-sm font-medium text-foreground">{node.data.label}</p>
            <p className="font-mono text-xs text-muted-foreground">{node.data.nodeType}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="h-4 w-4" strokeWidth={1.5} />
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {node.data.nodeType === "trigger.manual" && (
          <p className="text-sm text-muted-foreground">
            Sem configuracao — informe o payload na hora de executar.
          </p>
        )}

        {node.data.nodeType === "trigger.webhook" && (
          <Field label="URL do webhook">
            <Input
              readOnly
              value={
                config.webhookId
                  ? `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333"}/hooks/${config.webhookId}`
                  : "salve o fluxo para gerar a URL"
              }
              className="font-mono text-xs"
            />
          </Field>
        )}

        {node.data.nodeType === "api.httpRequest" && (
          <HttpRequestFields config={config} onChange={onChange} />
        )}

        {node.data.nodeType === "logic.if" && <IfFields config={config} onChange={onChange} />}

        {node.data.nodeType === "logic.setVariables" && (
          <SetVariablesFields config={config} onChange={onChange} />
        )}

        {node.data.nodeType === "logic.log" && (
          <Field label="Mensagem" hint="Vazio usa o dado recebido. Suporta expressoes {{ }}.">
            <Textarea
              value={(config.message as string) ?? ""}
              onChange={(event) => onChange({ ...config, message: event.target.value })}
              rows={4}
            />
          </Field>
        )}
      </div>
    </aside>
  );
}
