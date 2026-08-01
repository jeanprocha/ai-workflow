import { cloneElement, createElement, isValidElement, useId, useState } from "react";
import { toast } from "sonner";
import { Copy, Plus, Trash2, X } from "lucide-react";
import type { NodeRetryPolicy } from "@workflow/shared";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CredentialSelect } from "@/components/credential-select";
import { copyToClipboard } from "@/lib/clipboard";
import { getCatalogEntry } from "@/lib/node-catalog";
import { getNodeIcon } from "@/lib/node-icons";
import { usePreviewCron } from "@/hooks/use-scheduler";
import { useCreateNodePreset, useNodePresets } from "@/hooks/use-node-presets";
import {
  useCreateFlowApiKey,
  useFlowApiKeys,
  useRevokeFlowApiKey,
} from "@/hooks/use-flow-api-keys";
import { ApiError } from "@/lib/api-client";
import { errorMessage } from "@/lib/errors";
import { useDictionary, useLocale } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import type { WorkflowFlowNode } from "./workflow-node";

export interface ConfigPanelProps {
  workflowId: string;
  node: WorkflowFlowNode;
  retry?: NodeRetryPolicy;
  onChange: (config: Record<string, unknown>) => void;
  onRetryChange: (retry: NodeRetryPolicy | undefined) => void;
  onError?: "fail" | "branch" | "continue";
  onOnErrorChange: (onError: "branch" | "continue" | undefined) => void;
  onClose: () => void;
}

/**
 * Sem htmlFor/id, getByLabel() nao alcancava NENHUM campo do painel (Label e
 * irmao do input, nao wrapper) — todo o painel so era testavel por locators
 * posicionais/de placeholder. Quando children e um unico elemento controlavel
 * (Input/Textarea/select — o caso comum), clona um id gerado nele e aponta o
 * htmlFor do Label pra la. Campos compostos (ex.: lista de headers, que
 * envolvem varios inputs num <div>) ficam como estavam: o clone e inofensivo
 * (um id num <div> nao vira alvo de getByLabel), cada linha ja tem seu
 * proprio locator por placeholder.
 */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  const id = useId();
  const control = isValidElement<{ id?: string }>(children)
    ? cloneElement(children, { id: children.props.id ?? id })
    : children;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {control}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

interface HttpSignatureConfig {
  enabled: boolean;
  algorithm: "sha256" | "sha1" | "sha512";
  encoding: "hex" | "base64";
  secret: string;
  template: string;
  timestampOffsetSec: number;
}

const DEFAULT_HTTP_SIGNATURE: HttpSignatureConfig = {
  enabled: false,
  algorithm: "sha256",
  encoding: "hex",
  secret: "",
  template: "",
  timestampOffsetSec: 0,
};

/** Lista chave/valor editavel — mesmo padrao dos headers, reusado pra query string. */
function KeyValueList({
  entries,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
  addLabel,
}: {
  entries: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
  addLabel: string;
}) {
  const rows = Object.entries(entries);

  function setRow(index: number, key: string, value: string) {
    const next = [...rows];
    next[index] = [key, value];
    onChange(Object.fromEntries(next));
  }

  function removeRow(index: number) {
    onChange(Object.fromEntries(rows.filter((_, i) => i !== index)));
  }

  return (
    <div className="space-y-1.5">
      {rows.map(([key, value], index) => (
        <div key={index} className="flex gap-1.5">
          <Input
            value={key}
            onChange={(event) => setRow(index, event.target.value, value)}
            placeholder={keyPlaceholder}
            className="flex-1"
          />
          <Input
            value={value}
            onChange={(event) => setRow(index, key, event.target.value)}
            placeholder={valuePlaceholder}
            className="flex-1"
          />
          <Button variant="ghost" size="icon-sm" onClick={() => removeRow(index)}>
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => onChange({ ...entries, "": "" })}>
        <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
        {addLabel}
      </Button>
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
  const t = useDictionary().editor.configPanel;
  const headers = (config.headers as Record<string, string>) ?? {};
  const query = (config.query as Record<string, string>) ?? {};
  const signature = (config.signature as HttpSignatureConfig) ?? DEFAULT_HTTP_SIGNATURE;

  // Corpo e JSON livre — igual JsonConfigFields, texto local + erro de parse,
  // so re-sincroniza do config quando o node muda (ConfigPanel remonta com
  // `key={node.id}`, ver flow-editor.tsx).
  const [bodyText, setBodyText] = useState(() =>
    config.body !== undefined ? JSON.stringify(config.body, null, 2) : "",
  );
  const [bodyError, setBodyError] = useState<string | null>(null);

  function handleBodyChange(value: string) {
    setBodyText(value);
    if (value.trim() === "") {
      setBodyError(null);
      onChange({ ...config, body: undefined });
      return;
    }
    try {
      const parsed: unknown = JSON.parse(value);
      setBodyError(null);
      onChange({ ...config, body: parsed });
    } catch {
      setBodyError(t.json.invalidError);
    }
  }

  function updateSignature(patch: Partial<HttpSignatureConfig>) {
    onChange({ ...config, signature: { ...signature, ...patch } });
  }

  return (
    <>
      <Field label={t.http.method}>
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

      <Field label={t.http.url} hint={t.http.urlHint}>
        <Input
          value={(config.url as string) ?? ""}
          onChange={(event) => onChange({ ...config, url: event.target.value })}
          placeholder={t.http.urlPlaceholder}
        />
      </Field>

      <Field label={t.http.headers}>
        <KeyValueList
          entries={headers}
          onChange={(next) => onChange({ ...config, headers: next })}
          keyPlaceholder={t.http.headerNamePlaceholder}
          valuePlaceholder={t.http.headerValuePlaceholder}
          addLabel={t.http.addHeader}
        />
      </Field>

      <Field label={t.http.timeout}>
        <Input
          type="number"
          value={(config.timeoutMs as number) ?? 10000}
          onChange={(event) => onChange({ ...config, timeoutMs: Number(event.target.value) })}
        />
      </Field>

      {/* Sem primitiva de Collapsible no design system — details/summary e acessivel por padrao e nao precisa de dependencia nova. */}
      <details className="rounded-md border border-border">
        <summary className="cursor-pointer select-none rounded-md px-3 py-2 text-sm font-medium text-foreground">
          {t.http.advanced}
        </summary>
        <div className="space-y-4 border-t border-border p-3">
          <CredentialSelect
            id="http-credential"
            label={t.http.credentialLabel}
            hint={t.http.credentialHint}
            value={(config.credential as string) ?? ""}
            onChange={(value) => onChange({ ...config, credential: value })}
          />

          <Field label={t.http.queryLabel}>
            <KeyValueList
              entries={query}
              onChange={(next) => onChange({ ...config, query: next })}
              keyPlaceholder={t.http.queryKeyPlaceholder}
              valuePlaceholder={t.http.queryValuePlaceholder}
              addLabel={t.http.addQueryParam}
            />
          </Field>

          <Field label={t.http.bodyLabel} hint={t.http.bodyHint}>
            <Textarea
              value={bodyText}
              onChange={(event) => handleBodyChange(event.target.value)}
              rows={6}
              className="font-mono text-xs"
            />
            {bodyError && <p className="text-xs text-danger">{bodyError}</p>}
          </Field>

          <section className="space-y-2 rounded-md border border-border p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={signature.enabled}
                onChange={(event) => updateSignature({ enabled: event.target.checked })}
                className="h-4 w-4 rounded border-border-strong"
              />
              {t.http.signature.toggle}
            </label>
            {signature.enabled && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={t.http.signature.algorithm}>
                    <select
                      value={signature.algorithm}
                      onChange={(event) =>
                        updateSignature({
                          algorithm: event.target.value as HttpSignatureConfig["algorithm"],
                        })
                      }
                      className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm"
                    >
                      {["sha256", "sha1", "sha512"].map((algorithm) => (
                        <option key={algorithm} value={algorithm}>
                          {algorithm}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t.http.signature.encoding}>
                    <select
                      value={signature.encoding}
                      onChange={(event) =>
                        updateSignature({
                          encoding: event.target.value as HttpSignatureConfig["encoding"],
                        })
                      }
                      className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm"
                    >
                      {["hex", "base64"].map((encoding) => (
                        <option key={encoding} value={encoding}>
                          {encoding}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label={t.http.signature.secretLabel}>
                  <Input
                    value={signature.secret}
                    onChange={(event) => updateSignature({ secret: event.target.value })}
                    placeholder={t.http.signature.secretPlaceholder}
                    className="font-mono text-xs"
                  />
                </Field>
                <Field label={t.http.signature.templateLabel}>
                  <Input
                    value={signature.template}
                    onChange={(event) => updateSignature({ template: event.target.value })}
                    placeholder={t.http.signature.templatePlaceholder}
                    className="font-mono text-xs"
                  />
                </Field>
                <Field label={t.http.signature.offsetLabel}>
                  <Input
                    type="number"
                    value={signature.timestampOffsetSec}
                    onChange={(event) =>
                      updateSignature({ timestampOffsetSec: Number(event.target.value) })
                    }
                  />
                </Field>
              </>
            )}
          </section>

          <p className="text-xs text-muted-foreground">{t.http.rootsHint}</p>
        </div>
      </details>
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
  const t = useDictionary().editor.configPanel;
  return (
    <>
      <Field label={t.ifNode.leftValue} hint={t.ifNode.leftValueHint}>
        <Input
          value={String(config.left ?? "")}
          onChange={(event) => onChange({ ...config, left: event.target.value })}
        />
      </Field>
      <Field label={t.ifNode.operator}>
        <select
          value={(config.operator as string) ?? "=="}
          onChange={(event) => onChange({ ...config, operator: event.target.value })}
          className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm"
        >
          {["==", "!=", ">", "<", ">=", "<=", "contains", "matches"].map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label={t.ifNode.rightValue}
        hint={config.operator === "matches" ? t.ifNode.rightValueMatchesHint : undefined}
      >
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
  const t = useDictionary().editor.configPanel;
  const assignments = (config.assignments as Array<{ key: string; value: unknown }>) ?? [];

  function update(index: number, patch: Partial<{ key: string; value: unknown }>) {
    const next = assignments.map((assignment, i) =>
      i === index ? { ...assignment, ...patch } : assignment,
    );
    onChange({ ...config, assignments: next });
  }

  return (
    <Field label={t.setVariables.label}>
      <div className="space-y-1.5">
        {assignments.map((assignment, index) => (
          <div key={index} className="flex gap-1.5">
            <Input
              value={assignment.key}
              onChange={(event) => update(index, { key: event.target.value })}
              placeholder={t.setVariables.keyPlaceholder}
              className="flex-1"
            />
            <Input
              value={String(assignment.value ?? "")}
              onChange={(event) => update(index, { value: event.target.value })}
              placeholder={t.setVariables.valuePlaceholder}
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
          {t.setVariables.add}
        </Button>
      </div>
    </Field>
  );
}

function TransformListFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const t = useDictionary().editor.configPanel;
  const fields = (config.fields as Array<{ as: string; path: string }>) ?? [];

  function update(index: number, patch: Partial<{ as: string; path: string }>) {
    const next = fields.map((field, i) => (i === index ? { ...field, ...patch } : field));
    onChange({ ...config, fields: next });
  }

  return (
    <>
      <Field label={t.transformList.source} hint={t.transformList.sourceHint}>
        <Input
          value={String(config.source ?? "")}
          onChange={(event) => onChange({ ...config, source: event.target.value })}
        />
      </Field>
      <Field label={t.transformList.offset} hint={t.transformList.offsetHint}>
        <Input
          type="number"
          min={0}
          value={Number(config.offset ?? 0)}
          onChange={(event) => onChange({ ...config, offset: Number(event.target.value) || 0 })}
        />
      </Field>
      <Field label={t.transformList.limit} hint={t.transformList.limitHint}>
        <Input
          type="number"
          min={0}
          value={Number(config.limit ?? 0)}
          onChange={(event) => onChange({ ...config, limit: Number(event.target.value) || 0 })}
        />
      </Field>
      <Field label={t.transformList.fieldsLabel}>
        <div className="space-y-1.5">
          {fields.map((field, index) => (
            <div key={index} className="flex gap-1.5">
              <Input
                value={field.as}
                onChange={(event) => update(index, { as: event.target.value })}
                placeholder={t.transformList.asPlaceholder}
                className="flex-1"
              />
              <Input
                value={field.path}
                onChange={(event) => update(index, { path: event.target.value })}
                placeholder={t.transformList.pathPlaceholder}
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onChange({ ...config, fields: fields.filter((_, i) => i !== index) })}
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChange({ ...config, fields: [...fields, { as: "", path: "" }] })}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
            {t.transformList.add}
          </Button>
        </div>
      </Field>
    </>
  );
}

function AppendToListFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const t = useDictionary().editor.configPanel;
  // Item e um objeto arbitrario (ex.: { id, quantidade } de um item do
  // carrinho) — mesmo padrao do corpo do node HTTP: texto local + erro de
  // parse, so re-sincroniza quando o node muda (key={node.id} no painel).
  const [itemText, setItemText] = useState(() => JSON.stringify(config.item ?? {}, null, 2));
  const [itemError, setItemError] = useState<string | null>(null);

  function handleItemChange(value: string) {
    setItemText(value);
    try {
      const parsed: unknown = JSON.parse(value);
      setItemError(null);
      onChange({ ...config, item: parsed });
    } catch {
      setItemError(t.json.invalidError);
    }
  }

  return (
    <>
      <Field label={t.appendToList.source} hint={t.appendToList.sourceHint}>
        <Input
          value={String(config.source ?? "")}
          onChange={(event) => onChange({ ...config, source: event.target.value })}
        />
      </Field>
      <Field label={t.appendToList.item} hint={t.appendToList.itemHint}>
        <Textarea
          value={itemText}
          onChange={(event) => handleItemChange(event.target.value)}
          rows={6}
          className="font-mono text-xs"
        />
        {itemError && <p className="text-xs text-danger">{itemError}</p>}
      </Field>
    </>
  );
}

function DelayFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const t = useDictionary().editor.configPanel;
  return (
    <Field label={t.delay.duration} hint={t.delay.durationHint}>
      <Input
        type="number"
        value={(config.ms as number) ?? 1000}
        onChange={(event) => onChange({ ...config, ms: Number(event.target.value) })}
      />
    </Field>
  );
}

function CodeFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const t = useDictionary().editor.configPanel;
  return (
    <>
      <Field label={t.code.codeLabel} hint={t.code.codeHint}>
        <Textarea
          value={(config.code as string) ?? ""}
          onChange={(event) => onChange({ ...config, code: event.target.value })}
          rows={14}
          className="font-mono text-xs"
          spellCheck={false}
        />
      </Field>
      <Field label={t.code.timeoutLabel} hint={t.code.timeoutHint}>
        <Input
          type="number"
          value={(config.timeoutMs as number) ?? 5000}
          onChange={(event) => onChange({ ...config, timeoutMs: Number(event.target.value) })}
        />
      </Field>
    </>
  );
}

const TIMEZONES = [
  "UTC",
  "America/Sao_Paulo",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/Lisbon",
  "Europe/London",
];

function CronFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const t = useDictionary().editor.configPanel;
  const locale = useLocale();
  const cronExpression = (config.cronExpression as string) ?? "0 9 * * *";
  const timezone = (config.timezone as string) ?? "America/Sao_Paulo";
  const enabled = (config.enabled as boolean) ?? true;

  const cronPresets = [
    { label: t.cron.presetEveryMinute, value: "* * * * *" },
    { label: t.cron.presetEvery5Minutes, value: "*/5 * * * *" },
    { label: t.cron.presetHourly, value: "0 * * * *" },
    { label: t.cron.presetDaily9am, value: "0 9 * * *" },
    { label: t.cron.presetWeekly, value: "0 9 * * 1" },
    { label: t.cron.presetMonthly, value: "0 9 1 * *" },
  ];

  const previewCron = usePreviewCron();
  const previewError =
    previewCron.error instanceof ApiError ? previewCron.error.message : null;

  async function loadPreview(expr: string, tz: string) {
    await previewCron.mutateAsync({ cronExpression: expr, timezone: tz }).catch(() => undefined);
  }

  return (
    <>
      <Field label={t.cron.presetsLabel}>
        <select
          onChange={(event) => {
            if (!event.target.value) return;
            onChange({ ...config, cronExpression: event.target.value });
            void loadPreview(event.target.value, timezone);
          }}
          defaultValue=""
          className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm"
        >
          <option value="">{t.cron.customOption}</option>
          {cronPresets.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t.cron.expression} hint={t.cron.expressionHint}>
        <Input
          value={cronExpression}
          onChange={(event) => onChange({ ...config, cronExpression: event.target.value })}
          onBlur={() => void loadPreview(cronExpression, timezone)}
          className="font-mono text-xs"
        />
      </Field>

      <Field label={t.cron.timezone}>
        <select
          value={timezone}
          onChange={(event) => {
            onChange({ ...config, timezone: event.target.value });
            void loadPreview(cronExpression, event.target.value);
          }}
          className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </Field>

      <label className="flex items-center gap-1.5 text-sm text-foreground">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onChange({ ...config, enabled: event.target.checked })}
          className="h-4 w-4 rounded border-border-strong"
        />
        {t.cron.enabledLabel}
      </label>

      <div className="rounded-md border border-border bg-muted p-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadPreview(cronExpression, timezone)}
        >
          {t.cron.calculateButton}
        </Button>
        {previewError && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {previewError}
          </p>
        )}
        {previewCron.data && (
          <ul aria-label={t.cron.nextRunsAria} className="mt-2 space-y-0.5">
            {previewCron.data.nextRuns.map((run) => (
              <li key={run} className="font-mono text-xs text-muted-foreground">
                {formatDateTime(run, locale)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function TextField({
  config,
  onChange,
  field,
  label,
  hint,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  field: string;
  label: string;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <Input
        value={String(config[field] ?? "")}
        onChange={(event) => onChange({ ...config, [field]: event.target.value })}
      />
    </Field>
  );
}

function CredentialField({
  config,
  onChange,
  hint,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  hint: string;
}) {
  const t = useDictionary().editor.configPanel;
  return (
    <CredentialSelect
      id="node-credential"
      label={t.credential.label}
      hint={hint}
      value={(config.credential as string) ?? ""}
      onChange={(value) => onChange({ ...config, credential: value })}
    />
  );
}

function GithubFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const t = useDictionary().editor.configPanel;
  return (
    <>
      <CredentialField config={config} onChange={onChange} hint={t.github.credentialHint} />
      <TextField config={config} onChange={onChange} field="owner" label={t.github.owner} hint={t.github.ownerHint} />
      <TextField config={config} onChange={onChange} field="repo" label={t.github.repo} />
      <TextField config={config} onChange={onChange} field="title" label={t.github.issueTitle} />
      <Field label={t.github.body}>
        <Textarea
          rows={3}
          value={String(config.body ?? "")}
          onChange={(event) => onChange({ ...config, body: event.target.value })}
        />
      </Field>
    </>
  );
}

function StripeFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const t = useDictionary().editor.configPanel;
  return (
    <>
      <CredentialField config={config} onChange={onChange} hint={t.stripe.credentialHint} />
      <TextField config={config} onChange={onChange} field="email" label={t.stripe.customerEmail} />
      <TextField config={config} onChange={onChange} field="name" label={t.stripe.customerName} />
    </>
  );
}

function NotionFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const t = useDictionary().editor.configPanel;
  return (
    <>
      <CredentialField config={config} onChange={onChange} hint={t.notion.credentialHint} />
      <TextField config={config} onChange={onChange} field="databaseId" label={t.notion.databaseId} />
      <TextField config={config} onChange={onChange} field="title" label={t.notion.pageTitle} />
      <TextField
        config={config}
        onChange={onChange}
        field="titleProperty"
        label={t.notion.titleProperty}
        hint={t.notion.titlePropertyHint}
      />
    </>
  );
}

function GoogleDriveFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const t = useDictionary().editor.configPanel;
  return (
    <>
      <CredentialField config={config} onChange={onChange} hint={t.googleDrive.credentialHint} />
      <TextField config={config} onChange={onChange} field="query" label={t.googleDrive.query} hint={t.googleDrive.queryHint} />
      <Field label={t.googleDrive.pageSize}>
        <Input
          type="number"
          min={1}
          max={100}
          value={Number(config.pageSize ?? 10)}
          onChange={(event) => onChange({ ...config, pageSize: Number(event.target.value) })}
        />
      </Field>
    </>
  );
}

function LinearFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const t = useDictionary().editor.configPanel;
  return (
    <>
      <CredentialField config={config} onChange={onChange} hint={t.linear.credentialHint} />
      <TextField config={config} onChange={onChange} field="teamId" label={t.linear.teamId} />
      <TextField config={config} onChange={onChange} field="title" label={t.linear.issueTitle} />
      <Field label={t.linear.description}>
        <Textarea
          rows={3}
          value={String(config.description ?? "")}
          onChange={(event) => onChange({ ...config, description: event.target.value })}
        />
      </Field>
    </>
  );
}

function WhatsappFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const t = useDictionary().editor.configPanel;
  return (
    <>
      <CredentialField config={config} onChange={onChange} hint={t.whatsapp.credentialHint} />
      <TextField config={config} onChange={onChange} field="phoneNumberId" label={t.whatsapp.phoneNumberId} />
      <TextField config={config} onChange={onChange} field="to" label={t.whatsapp.to} hint={t.whatsapp.toHint} />
      <Field label={t.whatsapp.message}>
        <Textarea
          rows={3}
          value={String(config.message ?? "")}
          onChange={(event) => onChange({ ...config, message: event.target.value })}
        />
      </Field>
    </>
  );
}

function TeamsFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const t = useDictionary().editor.configPanel;
  return (
    <>
      <CredentialField config={config} onChange={onChange} hint={t.teams.credentialHint} />
      <Field label={t.teams.message}>
        <Textarea
          rows={3}
          value={String(config.message ?? "")}
          onChange={(event) => onChange({ ...config, message: event.target.value })}
        />
      </Field>
    </>
  );
}

function ApprovalHumanFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const t = useDictionary().editor.configPanel;
  return (
    <>
      <TextField
        config={config}
        onChange={onChange}
        field="title"
        label={t.approvalHuman.title}
        hint={t.approvalHuman.titleHint}
      />
      <CredentialField config={config} onChange={onChange} hint={t.approvalHuman.credentialHint} />
      <TextField
        config={config}
        onChange={onChange}
        field="recipients"
        label={t.approvalHuman.recipients}
        hint={t.approvalHuman.recipientsHint}
      />
      <Field label={t.approvalHuman.message} hint={t.approvalHuman.messageHint}>
        <Textarea
          rows={3}
          value={String(config.message ?? "")}
          onChange={(event) => onChange({ ...config, message: event.target.value })}
        />
      </Field>
      <Field label={t.approvalHuman.timeoutHours} hint={t.approvalHuman.timeoutHoursHint}>
        <Input
          type="number"
          min={1}
          max={720}
          value={(config.timeoutHours as number) ?? 24}
          onChange={(event) =>
            onChange({ ...config, timeoutHours: Number(event.target.value) })
          }
        />
      </Field>
      <Field label={t.approvalHuman.onTimeout}>
        <select
          value={(config.onTimeout as string) ?? "reject"}
          onChange={(event) => onChange({ ...config, onTimeout: event.target.value })}
          className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm"
        >
          <option value="reject">{t.approvalHuman.onTimeoutReject}</option>
          <option value="approve">{t.approvalHuman.onTimeoutApprove}</option>
        </select>
      </Field>
    </>
  );
}

function SwitchFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const t = useDictionary().editor.configPanel;
  const cases = (config.cases as unknown[]) ?? [];

  function setCase(index: number, value: string) {
    const next = [...cases];
    next[index] = value;
    onChange({ ...config, cases: next });
  }

  return (
    <>
      <Field label={t.switchNode.value} hint={t.switchNode.valueHint}>
        <Input
          value={String(config.value ?? "")}
          onChange={(event) => onChange({ ...config, value: event.target.value })}
        />
      </Field>
      <Field label={t.switchNode.cases} hint={t.switchNode.casesHint}>
        <div className="space-y-1.5">
          {[0, 1, 2, 3].map((index) => (
            <Input
              key={index}
              value={String(cases[index] ?? "")}
              onChange={(event) => setCase(index, event.target.value)}
              placeholder={t.switchNode.casePlaceholder(index)}
            />
          ))}
        </div>
      </Field>
    </>
  );
}

function ChatTriggerFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const t = useDictionary().editor.configPanel;
  const chatToken = config.chatToken as string | undefined;
  const inboxToken = config.inboxToken as string | undefined;
  // As paginas publicas sao servidas pelo proprio app web (nao pela API) —
  // mesma origem do editor, entao window.location.origin sempre resolve certo.
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <>
      <Field label={t.chatTrigger.chatUrlLabel}>
        <Input
          readOnly
          value={chatToken ? `${origin}/chat/${chatToken}` : t.chatTrigger.pendingSave}
          className="font-mono text-xs"
        />
      </Field>
      <Field label={t.chatTrigger.inboxUrlLabel}>
        <Input
          readOnly
          value={inboxToken ? `${origin}/inbox/${inboxToken}` : t.chatTrigger.pendingSave}
          className="font-mono text-xs"
        />
      </Field>
      <Field label={t.chatTrigger.welcomeMessage} hint={t.chatTrigger.welcomeMessageHint}>
        <Textarea
          rows={2}
          value={(config.welcomeMessage as string) ?? ""}
          onChange={(event) => onChange({ ...config, welcomeMessage: event.target.value })}
        />
      </Field>
      <Field label={t.chatTrigger.errorMessage} hint={t.chatTrigger.errorMessageHint}>
        <Textarea
          rows={2}
          value={(config.errorMessage as string) ?? ""}
          onChange={(event) => onChange({ ...config, errorMessage: event.target.value })}
        />
      </Field>
    </>
  );
}

function ChatReplyFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const t = useDictionary().editor.configPanel;
  return (
    <Field label={t.chatReply.message} hint={t.chatReply.messageHint}>
      <Textarea
        rows={3}
        value={(config.message as string) ?? ""}
        onChange={(event) => onChange({ ...config, message: event.target.value })}
      />
    </Field>
  );
}

function NoConfigNote({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

function JsonConfigFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const t = useDictionary().editor.configPanel;
  const [text, setText] = useState(() => JSON.stringify(config, null, 2));
  const [error, setError] = useState<string | null>(null);

  function handleChange(value: string) {
    setText(value);
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      setError(null);
      onChange(parsed);
    } catch {
      setError(t.json.invalidError);
    }
  }

  return (
    <Field
      label={t.json.label}
      hint={t.json.hint}
    >
      <Textarea
        value={text}
        onChange={(event) => handleChange(event.target.value)}
        rows={14}
        className="font-mono text-xs"
      />
      {error && <p className="text-xs text-danger">{error}</p>}
    </Field>
  );
}

function RetrySection({
  retry,
  onRetryChange,
}: {
  retry?: NodeRetryPolicy;
  onRetryChange: (retry: NodeRetryPolicy | undefined) => void;
}) {
  const t = useDictionary().editor.configPanel;
  const enabled = !!retry;

  return (
    <section className="space-y-2 rounded-md border border-border p-3">
      <label className="flex items-center gap-2 text-sm font-medium text-foreground">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) =>
            onRetryChange(event.target.checked ? { attempts: 3, backoffMs: 1000 } : undefined)
          }
          className="h-4 w-4 rounded border-border-strong"
        />
        {t.retry.toggle}
      </label>
      {enabled && retry && (
        <div className="grid grid-cols-2 gap-2">
          <Field label={t.retry.attempts}>
            <Input
              type="number"
              min={1}
              max={10}
              value={retry.attempts}
              onChange={(event) =>
                onRetryChange({ ...retry, attempts: Number(event.target.value) })
              }
            />
          </Field>
          <Field label={t.retry.interval}>
            <Input
              type="number"
              min={0}
              value={retry.backoffMs}
              onChange={(event) =>
                onRetryChange({ ...retry, backoffMs: Number(event.target.value) })
              }
            />
          </Field>
        </div>
      )}
    </section>
  );
}

function ErrorPathSection({
  onError,
  onOnErrorChange,
}: {
  onError?: "fail" | "branch" | "continue";
  onOnErrorChange: (onError: "branch" | "continue" | undefined) => void;
}) {
  const t = useDictionary().editor.configPanel;
  const value = onError ?? "fail";

  const options = [
    { value: "fail" as const, label: t.errorPath.fail },
    { value: "branch" as const, label: t.errorPath.branch },
    { value: "continue" as const, label: t.errorPath.continue },
  ];

  return (
    <section className="space-y-2 rounded-md border border-border p-3">
      <p className="text-sm font-medium text-foreground">{t.errorPath.legend}</p>
      <div className="space-y-1.5">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex items-center gap-2 text-sm text-foreground"
          >
            <input
              type="radio"
              name="error-path"
              checked={value === option.value}
              onChange={() =>
                onOnErrorChange(option.value === "fail" ? undefined : option.value)
              }
              className="h-4 w-4 border-border-strong"
            />
            {option.label}
          </label>
        ))}
      </div>
      {value === "branch" && (
        <p className="text-xs text-muted-foreground">{t.errorPath.branchDescription}</p>
      )}
      {value === "continue" && (
        <p className="text-xs text-muted-foreground">{t.errorPath.continueDescription}</p>
      )}
    </section>
  );
}

const JSON_FALLBACK_TYPES = new Set([
  "database.postgres",
  "database.mysql",
  "database.redis",
  "database.mongodb",
  "api.graphql",
  "file.csv",
  "file.pdf",
  "file.docx",
  "file.txt",
  "file.json",
  "communication.email",
  "communication.slack",
  "communication.discord",
  "communication.telegram",
  "ai.chat",
  "ai.classification",
  "ai.translation",
  "ai.summarization",
  "ai.extraction",
  "ai.vision",
  "ai.ocr",
  "ai.embeddings",
  "ai.agent",
  "knowledge.search",
  "mcp.tool",
]);

/**
 * Barra generica no topo do painel — funciona pra QUALQUER tipo de node
 * (nao so api.httpRequest): aplica uma predefinicao salva (mescla por cima
 * do config atual) ou salva o config atual como uma predefinicao nova.
 * Gerenciar/excluir predefinicoes fica em Configuracoes (mesmo padrao de
 * Conexoes/Variaveis).
 */
function PresetBar({
  nodeType,
  config,
  onApply,
}: {
  nodeType: string;
  config: Record<string, unknown>;
  onApply: (config: Record<string, unknown>) => void;
}) {
  const dict = useDictionary();
  const t = dict.editor.configPanel.presets;
  const { data: presets } = useNodePresets(nodeType);
  const createPreset = useCreateNodePreset();
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");

  function onSelectPreset(id: string) {
    const preset = presets?.find((p) => p.id === id);
    if (!preset) return;
    onApply({ ...config, ...preset.config });
    toast.success(t.appliedToast);
  }

  async function onSave() {
    if (!name.trim()) return;
    try {
      await createPreset.mutateAsync({ nodeType, name: name.trim(), config });
      toast.success(t.savedToast);
      setName("");
      setSaveOpen(false);
    } catch (error) {
      toast.error(errorMessage(error, t.saveErrorFallback));
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        aria-label={t.applyLabel}
        value=""
        onChange={(event) => onSelectPreset(event.target.value)}
        className="h-8 flex-1 rounded-md border border-border bg-background px-2.5 text-sm"
      >
        <option value="">{t.applyPlaceholder}</option>
        {presets?.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.name}
          </option>
        ))}
      </select>
      <Button variant="outline" size="sm" onClick={() => setSaveOpen(true)}>
        {t.saveButton}
      </Button>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.saveDialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="preset-save-name">{t.nameLabel}</Label>
            <Input
              id="preset-save-name"
              placeholder={t.namePlaceholder}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              {dict.common.cancel}
            </Button>
            <Button onClick={onSave} disabled={createPreset.isPending || !name.trim()}>
              {createPreset.isPending ? dict.common.saving : dict.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Id do node, com botao de copiar — sem isso, a unica forma de saber qual
 * id usar numa expressao `{{ $node.<id>... }}` era caçar numa execucao ja
 * rodada (o painel nunca mostrava o id em lugar nenhum).
 */
function NodeIdBadge({ id }: { id: string }) {
  const t = useDictionary().editor.configPanel;

  async function copy() {
    const ok = await copyToClipboard(id);
    if (ok) toast.success(t.nodeIdCopied);
    else toast.error(t.nodeIdCopyFailed);
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      title={t.nodeIdCopyHint}
      className="mt-0.5 flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
    >
      <span>id: {id}</span>
      <Copy className="h-3 w-3" strokeWidth={1.5} />
    </button>
  );
}

/**
 * Gestao de chaves de API do fluxo (H2-04) — vive no painel do trigger.webhook
 * (nao ha UI nova no editor). A chave bruta so existe uma vez, na resposta do
 * create: fica em useState local, nunca no cache do react-query (a lista
 * cacheada so tem `lastFour`), e some ao fechar o dialog de criacao.
 */
function PublishAsApiSection({ workflowId }: { workflowId: string }) {
  const dict = useDictionary();
  const t = dict.editor.configPanel.webhook.publishApi;
  const locale = useLocale();
  const { data: keys, isLoading, isError } = useFlowApiKeys(workflowId, true);
  const createKey = useCreateFlowApiKey(workflowId);
  const revokeKey = useRevokeFlowApiKey(workflowId);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [createdKey, setCreatedKey] = useState<{ key: string } | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";
  const endpoint = `${apiUrl}/v1/flows/${workflowId}/invoke`;

  async function copy(text: string, okMessage: string) {
    const ok = await copyToClipboard(text);
    if (ok) toast.success(okMessage);
    else toast.error(t.copyFailed);
  }

  async function onCreate() {
    if (!name.trim()) return;
    try {
      const created = await createKey.mutateAsync(name.trim());
      setCreatedKey({ key: created.key });
      setName("");
      setCreateOpen(false);
    } catch (error) {
      toast.error(errorMessage(error, t.createErrorFallback));
    }
  }

  async function onRevoke() {
    if (!revokeId) return;
    try {
      await revokeKey.mutateAsync(revokeId);
      toast.success(t.revokedToast);
    } catch (error) {
      toast.error(errorMessage(error, t.revokeErrorFallback));
    } finally {
      setRevokeId(null);
    }
  }

  const curlCommand = createdKey
    ? `curl -X POST ${endpoint} -H "Authorization: Bearer ${createdKey.key}" -H "Content-Type: application/json" -d '{}'`
    : "";

  return (
    <section className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{t.sectionTitle}</p>
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
          {t.createButton}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t.sectionHint}</p>
      <p className="text-xs font-medium text-warning">{t.saveWarning}</p>

      {isLoading && <p className="text-xs text-muted-foreground">{dict.common.loading}</p>}
      {isError && <p className="text-xs text-danger">{t.loadError}</p>}
      {!isLoading && !isError && (keys?.length ?? 0) === 0 && (
        <p className="text-xs text-muted-foreground">{t.emptyState}</p>
      )}
      {!isLoading && keys && keys.length > 0 && (
        <ul className="space-y-1.5">
          {keys.map((key) => (
            <li
              key={key.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-xs text-foreground">{t.keyMasked(key.lastFour)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {key.name} ·{" "}
                  {key.revokedAt
                    ? t.revokedBadge
                    : key.lastUsedAt
                      ? t.lastUsedAt(formatDateTime(key.lastUsedAt, locale))
                      : t.neverUsed}
                </p>
              </div>
              {!key.revokedAt && (
                <Button variant="ghost" size="sm" onClick={() => setRevokeId(key.id)}>
                  {t.revokeButton}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.createDialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="flow-api-key-name">{t.nameLabel}</Label>
            <Input
              id="flow-api-key-name"
              placeholder={t.namePlaceholder}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {dict.common.cancel}
            </Button>
            <Button onClick={() => void onCreate()} disabled={createKey.isPending || !name.trim()}>
              {createKey.isPending ? dict.common.saving : dict.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!createdKey} onOpenChange={(open) => !open && setCreatedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.createdDialogTitle}</DialogTitle>
          </DialogHeader>
          {createdKey && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-danger">{t.createdWarning}</p>
              <div className="space-y-1.5">
                <Label htmlFor="flow-api-key-value">{t.keyLabel}</Label>
                <div className="flex gap-1.5">
                  <Input id="flow-api-key-value" readOnly value={createdKey.key} className="font-mono text-xs" />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={t.copyKeyAria}
                    onClick={() => void copy(createdKey.key, t.keyCopied)}
                  >
                    <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="flow-api-endpoint">{t.endpointLabel}</Label>
                <Input id="flow-api-endpoint" readOnly value={endpoint} className="font-mono text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="flow-api-curl">{t.curlLabel}</Label>
                <div className="flex gap-1.5">
                  <Textarea
                    id="flow-api-curl"
                    readOnly
                    value={curlCommand}
                    rows={3}
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={t.copyCurlAria}
                    onClick={() => void copy(curlCommand, t.curlCopied)}
                  >
                    <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCreatedKey(null)}>{t.doneButton}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!revokeId} onOpenChange={(open) => !open && setRevokeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.revokeConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.revokeConfirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{dict.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger/10 text-danger hover:bg-danger/20"
              onClick={() => void onRevoke()}
            >
              {t.revokeButton}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function WebhookFields({
  config,
  workflowId,
}: {
  config: Record<string, unknown>;
  workflowId: string;
}) {
  const t = useDictionary().editor.configPanel;
  const webhookId = config.webhookId as string | undefined;
  const url = webhookId
    ? `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333"}/hooks/${webhookId}`
    : "";

  async function copyUrl() {
    const ok = await copyToClipboard(url);
    if (ok) toast.success(t.webhook.urlCopied);
    else toast.error(t.webhook.urlCopyFailed);
  }

  return (
    <>
      <Field label={t.webhook.label}>
        <div className="flex gap-1.5">
          <Input readOnly value={webhookId ? url : t.webhook.pendingSave} className="font-mono text-xs" />
          {webhookId && (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={t.webhook.copyUrlAria}
              onClick={() => void copyUrl()}
            >
              <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
            </Button>
          )}
        </div>
      </Field>
      <PublishAsApiSection workflowId={workflowId} />
    </>
  );
}

export function ConfigPanel({
  workflowId,
  node,
  retry,
  onChange,
  onRetryChange,
  onError,
  onOnErrorChange,
  onClose,
}: ConfigPanelProps) {
  const t = useDictionary().editor.configPanel;
  const entry = getCatalogEntry(node.data.nodeType);
  const config = node.data.config;

  return (
    // Mobile: sobreposicao em tela cheia (um painel de 384px nao cabe numa
    // viewport de 390px); desktop: drawer lateral de largura fixa.
    <aside className="fixed inset-0 z-40 flex h-full w-full shrink-0 flex-col border-l border-border bg-card md:static md:z-auto md:w-96">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          {createElement(getNodeIcon(entry?.icon ?? ""), {
            className: "h-4 w-4 text-muted-foreground",
            strokeWidth: 1.5,
          })}
          <div>
            <p className="text-sm font-medium text-foreground">{node.data.label}</p>
            <p className="font-mono text-xs text-muted-foreground">{node.data.nodeType}</p>
            <NodeIdBadge id={node.id} />
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label={t.closeAria} onClick={onClose}>
          <X className="h-4 w-4" strokeWidth={1.5} />
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <PresetBar nodeType={node.data.nodeType} config={config} onApply={onChange} />

        {node.data.nodeType === "trigger.manual" && (
          <p className="text-sm text-muted-foreground">
            {t.noConfig.manualTrigger}
          </p>
        )}

        {node.data.nodeType === "trigger.webhook" && (
          <WebhookFields config={config} workflowId={workflowId} />
        )}

        {node.data.nodeType === "trigger.cron" && (
          <CronFields config={config} onChange={onChange} />
        )}

        {node.data.nodeType === "trigger.chat" && (
          <ChatTriggerFields config={config} onChange={onChange} />
        )}

        {node.data.nodeType === "chat.reply" && (
          <ChatReplyFields config={config} onChange={onChange} />
        )}

        {node.data.nodeType === "api.httpRequest" && (
          <HttpRequestFields config={config} onChange={onChange} />
        )}

        {node.data.nodeType === "logic.if" && <IfFields config={config} onChange={onChange} />}

        {node.data.nodeType === "logic.setVariables" && (
          <SetVariablesFields config={config} onChange={onChange} />
        )}

        {node.data.nodeType === "logic.transformList" && (
          <TransformListFields config={config} onChange={onChange} />
        )}

        {node.data.nodeType === "logic.appendToList" && (
          <AppendToListFields config={config} onChange={onChange} />
        )}

        {node.data.nodeType === "logic.log" && (
          <Field label={t.logField.label} hint={t.logField.hint}>
            <Textarea
              value={(config.message as string) ?? ""}
              onChange={(event) => onChange({ ...config, message: event.target.value })}
              rows={4}
            />
          </Field>
        )}

        {node.data.nodeType === "logic.delay" && <DelayFields config={config} onChange={onChange} />}
        {node.data.nodeType === "logic.code" && <CodeFields config={config} onChange={onChange} />}

        {node.data.nodeType === "logic.switch" && <SwitchFields config={config} onChange={onChange} />}

        {node.data.nodeType === "logic.merge" && (
          <NoConfigNote text={t.noConfig.merge} />
        )}

        {node.data.nodeType === "logic.parallel" && (
          <NoConfigNote text={t.noConfig.parallel} />
        )}

        {node.data.nodeType === "integration.github" && (
          <GithubFields config={config} onChange={onChange} />
        )}
        {node.data.nodeType === "integration.stripe" && (
          <StripeFields config={config} onChange={onChange} />
        )}
        {node.data.nodeType === "integration.notion" && (
          <NotionFields config={config} onChange={onChange} />
        )}
        {node.data.nodeType === "integration.googleDrive" && (
          <GoogleDriveFields config={config} onChange={onChange} />
        )}
        {node.data.nodeType === "integration.linear" && (
          <LinearFields config={config} onChange={onChange} />
        )}
        {node.data.nodeType === "integration.whatsapp" && (
          <WhatsappFields config={config} onChange={onChange} />
        )}
        {node.data.nodeType === "integration.teams" && (
          <TeamsFields config={config} onChange={onChange} />
        )}
        {node.data.nodeType === "approval.human" && (
          <ApprovalHumanFields config={config} onChange={onChange} />
        )}

        {JSON_FALLBACK_TYPES.has(node.data.nodeType) && (
          <JsonConfigFields config={config} onChange={onChange} />
        )}

        {!isTriggerType(node.data.nodeType) && (
          <>
            <RetrySection retry={retry} onRetryChange={onRetryChange} />
            <ErrorPathSection onError={onError} onOnErrorChange={onOnErrorChange} />
          </>
        )}
      </div>
    </aside>
  );
}

function isTriggerType(nodeType: string): boolean {
  return nodeType.startsWith("trigger.");
}
