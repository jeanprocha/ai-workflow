import { createElement, useState } from "react";
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
import type { WorkflowFlowNode } from "./workflow-node";

export interface ConfigPanelProps {
  node: WorkflowFlowNode;
  retry?: NodeRetryPolicy;
  onChange: (config: Record<string, unknown>) => void;
  onRetryChange: (retry: NodeRetryPolicy | undefined) => void;
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

function DelayFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  return (
    <Field label="Duracao (ms)">
      <Input
        type="number"
        value={(config.ms as number) ?? 1000}
        onChange={(event) => onChange({ ...config, ms: Number(event.target.value) })}
      />
    </Field>
  );
}

const CRON_PRESETS = [
  { label: "A cada minuto", value: "* * * * *" },
  { label: "A cada 5 minutos", value: "*/5 * * * *" },
  { label: "A cada hora", value: "0 * * * *" },
  { label: "Diariamente as 9h", value: "0 9 * * *" },
  { label: "Semanalmente (seg 9h)", value: "0 9 * * 1" },
  { label: "Mensalmente (dia 1, 9h)", value: "0 9 1 * *" },
];

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
  const cronExpression = (config.cronExpression as string) ?? "0 9 * * *";
  const timezone = (config.timezone as string) ?? "America/Sao_Paulo";
  const enabled = (config.enabled as boolean) ?? true;

  const previewCron = usePreviewCron();
  const previewError =
    previewCron.error instanceof ApiError ? previewCron.error.message : null;

  async function loadPreview(expr: string, tz: string) {
    await previewCron.mutateAsync({ cronExpression: expr, timezone: tz }).catch(() => undefined);
  }

  return (
    <>
      <Field label="Presets">
        <select
          onChange={(event) => {
            if (!event.target.value) return;
            onChange({ ...config, cronExpression: event.target.value });
            void loadPreview(event.target.value, timezone);
          }}
          defaultValue=""
          className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm"
        >
          <option value="">Personalizado (editar abaixo)</option>
          {CRON_PRESETS.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Expressao cron" hint="Formato: minuto hora dia-do-mes mes dia-da-semana">
        <Input
          value={cronExpression}
          onChange={(event) => onChange({ ...config, cronExpression: event.target.value })}
          onBlur={() => void loadPreview(cronExpression, timezone)}
          className="font-mono text-xs"
        />
      </Field>

      <Field label="Timezone">
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
        Agendamento habilitado
      </label>

      <div className="rounded-md border border-border bg-muted p-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadPreview(cronExpression, timezone)}
        >
          Calcular proximas execucoes
        </Button>
        {previewError && <p className="mt-2 text-xs text-danger">{previewError}</p>}
        {previewCron.data && (
          <ul className="mt-2 space-y-0.5">
            {previewCron.data.nextRuns.map((run) => (
              <li key={run} className="font-mono text-xs text-muted-foreground">
                {new Date(run).toLocaleString("pt-BR")}
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
  return <TextField config={config} onChange={onChange} field="credential" label="Conexao" hint={hint} />;
}

function GithubFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  return (
    <>
      <CredentialField config={config} onChange={onChange} hint="Nome da conexao (Personal Access Token) do GitHub." />
      <TextField config={config} onChange={onChange} field="owner" label="Owner" hint="Usuario ou organizacao." />
      <TextField config={config} onChange={onChange} field="repo" label="Repo" />
      <TextField config={config} onChange={onChange} field="title" label="Titulo da issue" />
      <Field label="Corpo">
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
  return (
    <>
      <CredentialField config={config} onChange={onChange} hint="Nome da conexao (secret key) do Stripe." />
      <TextField config={config} onChange={onChange} field="email" label="Email do cliente" />
      <TextField config={config} onChange={onChange} field="name" label="Nome do cliente" />
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
  return (
    <>
      <CredentialField config={config} onChange={onChange} hint="Nome da conexao (integration token) do Notion." />
      <TextField config={config} onChange={onChange} field="databaseId" label="Database ID" />
      <TextField config={config} onChange={onChange} field="title" label="Titulo da pagina" />
      <TextField
        config={config}
        onChange={onChange}
        field="titleProperty"
        label="Propriedade de titulo"
        hint="Nome da propriedade do database usada como titulo (padrao: Name)."
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
  return (
    <>
      <CredentialField config={config} onChange={onChange} hint="Nome da conexao (JSON da Service Account) do Google Drive." />
      <TextField config={config} onChange={onChange} field="query" label="Filtro (query)" hint="Sintaxe de busca do Google Drive." />
      <Field label="Itens por pagina">
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
  return (
    <>
      <CredentialField config={config} onChange={onChange} hint="Nome da conexao (API key) do Linear." />
      <TextField config={config} onChange={onChange} field="teamId" label="Team ID" />
      <TextField config={config} onChange={onChange} field="title" label="Titulo da issue" />
      <Field label="Descricao">
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
  return (
    <>
      <CredentialField config={config} onChange={onChange} hint="Nome da conexao (access token) do WhatsApp Cloud API." />
      <TextField config={config} onChange={onChange} field="phoneNumberId" label="Phone Number ID" />
      <TextField config={config} onChange={onChange} field="to" label="Numero de destino" hint="Formato internacional, sem simbolos." />
      <Field label="Mensagem">
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
  return (
    <>
      <CredentialField config={config} onChange={onChange} hint="Nome da conexao (webhook URL) do Teams." />
      <Field label="Mensagem">
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
  const cases = (config.cases as unknown[]) ?? [];

  function setCase(index: number, value: string) {
    const next = [...cases];
    next[index] = value;
    onChange({ ...config, cases: next });
  }

  return (
    <>
      <Field label="Valor" hint="Ex: {{ $input.tipo }}">
        <Input
          value={String(config.value ?? "")}
          onChange={(event) => onChange({ ...config, value: event.target.value })}
        />
      </Field>
      <Field label="Casos (ate 4)" hint="O primeiro caso igual ao valor dispara o output correspondente (0-3).">
        <div className="space-y-1.5">
          {[0, 1, 2, 3].map((index) => (
            <Input
              key={index}
              value={String(cases[index] ?? "")}
              onChange={(event) => setCase(index, event.target.value)}
              placeholder={`Caso ${index}`}
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
  const [text, setText] = useState(() => JSON.stringify(config, null, 2));
  const [error, setError] = useState<string | null>(null);

  function handleChange(value: string) {
    setText(value);
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      setError(null);
      onChange(parsed);
    } catch {
      setError("JSON invalido — as alteracoes nao sao salvas ate corrigir.");
    }
  }

  return (
    <Field
      label="Configuracao (JSON)"
      hint="Campos deste node em JSON. Valores de texto suportam expressoes {{ }}."
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
        Tentar novamente em caso de erro
      </label>
      {enabled && retry && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Tentativas">
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
          <Field label="Intervalo (ms)">
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
          <Field label="Mensagem" hint="Vazio usa o dado recebido. Suporta expressoes {{ }}.">
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
          <NoConfigNote text="Sem configuracao — este node so dispara quando todos os caminhos anteriores completarem, juntando os resultados num array." />
        )}

        {node.data.nodeType === "logic.parallel" && (
          <NoConfigNote text="Sem configuracao — conecte ate 3 caminhos para rodarem em paralelo com o mesmo dado de entrada." />
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
