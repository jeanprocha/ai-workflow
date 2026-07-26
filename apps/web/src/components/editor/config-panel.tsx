import { cloneElement, createElement, isValidElement, useId, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { NodeRetryPolicy } from "@workflow/shared";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { getCatalogEntry } from "@/lib/node-catalog";
import { getNodeIcon } from "@/lib/node-icons";
import { usePreviewCron } from "@/hooks/use-scheduler";
import { ApiError } from "@/lib/api-client";
import { useDictionary, useLocale } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import type { WorkflowFlowNode } from "./workflow-node";

export interface ConfigPanelProps {
  node: WorkflowFlowNode;
  retry?: NodeRetryPolicy;
  onChange: (config: Record<string, unknown>) => void;
  onRetryChange: (retry: NodeRetryPolicy | undefined) => void;
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

function HttpRequestFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const t = useDictionary().editor.configPanel;
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
        <div className="space-y-1.5">
          {headerEntries.map(([key, value], index) => (
            <div key={index} className="flex gap-1.5">
              <Input
                value={key}
                onChange={(event) => setHeader(index, event.target.value, value)}
                placeholder={t.http.headerNamePlaceholder}
                className="flex-1"
              />
              <Input
                value={value}
                onChange={(event) => setHeader(index, key, event.target.value)}
                placeholder={t.http.headerValuePlaceholder}
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
            {t.http.addHeader}
          </Button>
        </div>
      </Field>

      <Field label={t.http.timeout}>
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
          {["==", "!=", ">", "<", ">=", "<=", "contains"].map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t.ifNode.rightValue}>
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

function DelayFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const t = useDictionary().editor.configPanel;
  return (
    <Field label={t.delay.duration}>
      <Input
        type="number"
        value={(config.ms as number) ?? 1000}
        onChange={(event) => onChange({ ...config, ms: Number(event.target.value) })}
      />
    </Field>
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
  return <TextField config={config} onChange={onChange} field="credential" label={t.credential.label} hint={hint} />;
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

export function ConfigPanel({ node, retry, onChange, onRetryChange, onClose }: ConfigPanelProps) {
  const t = useDictionary().editor.configPanel;
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
        <Button variant="ghost" size="icon-sm" aria-label={t.closeAria} onClick={onClose}>
          <X className="h-4 w-4" strokeWidth={1.5} />
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {node.data.nodeType === "trigger.manual" && (
          <p className="text-sm text-muted-foreground">
            {t.noConfig.manualTrigger}
          </p>
        )}

        {node.data.nodeType === "trigger.webhook" && (
          <Field label={t.webhook.label}>
            <Input
              readOnly
              value={
                config.webhookId
                  ? `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333"}/hooks/${config.webhookId}`
                  : t.webhook.pendingSave
              }
              className="font-mono text-xs"
            />
          </Field>
        )}

        {node.data.nodeType === "trigger.cron" && (
          <CronFields config={config} onChange={onChange} />
        )}

        {node.data.nodeType === "api.httpRequest" && (
          <HttpRequestFields config={config} onChange={onChange} />
        )}

        {node.data.nodeType === "logic.if" && <IfFields config={config} onChange={onChange} />}

        {node.data.nodeType === "logic.setVariables" && (
          <SetVariablesFields config={config} onChange={onChange} />
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

        {JSON_FALLBACK_TYPES.has(node.data.nodeType) && (
          <JsonConfigFields config={config} onChange={onChange} />
        )}

        {!isTriggerType(node.data.nodeType) && (
          <RetrySection retry={retry} onRetryChange={onRetryChange} />
        )}
      </div>
    </aside>
  );
}

function isTriggerType(nodeType: string): boolean {
  return nodeType.startsWith("trigger.");
}
