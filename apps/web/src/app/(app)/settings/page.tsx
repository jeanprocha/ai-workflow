"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { EmptyState } from "@workflow/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
import { ThemeToggle } from "@/components/shell/theme-toggle";
import {
  useCreateCredential,
  useCredentials,
  useDeleteCredential,
  useUpdateCredential,
  type CredentialFieldInput,
  type CredentialFieldType,
  type CredentialSummary,
} from "@/hooks/use-credentials";
import { useCreateVariable, useDeleteVariable, useVariables } from "@/hooks/use-variables";
import { useCreateNodePreset, useDeleteNodePreset, useNodePresets } from "@/hooks/use-node-presets";
import { NODE_CATALOG } from "@/lib/node-catalog";
import { errorMessage } from "@/lib/errors";
import { useDictionary, useLocale, setLocale, type Locale } from "@/lib/i18n";

function LanguageSelect() {
  const locale = useLocale();
  const t = useDictionary();

  return (
    <select
      aria-label={t.settings.appearance.languageLabel}
      value={locale}
      onChange={(event) => setLocale(event.target.value as Locale)}
      className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground"
    >
      <option value="pt">{t.settings.appearance.languagePt}</option>
      <option value="en">{t.settings.appearance.languageEn}</option>
    </select>
  );
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-md font-medium text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CredentialFieldsEditor({
  fields,
  onChange,
}: {
  fields: CredentialFieldInput[];
  onChange: (next: CredentialFieldInput[]) => void;
}) {
  const t = useDictionary();
  const c = t.settings.connections;

  function update(index: number, patch: Partial<CredentialFieldInput>) {
    onChange(fields.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  }

  return (
    <div className="space-y-1.5">
      {fields.map((field, index) => (
        <div key={index} className="flex gap-1.5">
          <Input
            value={field.key}
            onChange={(event) => update(index, { key: event.target.value })}
            placeholder={c.fieldKeyPlaceholder}
            className="flex-1"
          />
          <select
            aria-label={`${c.fieldTypeAria} ${field.key || index + 1}`}
            value={field.type}
            onChange={(event) =>
              update(index, { type: event.target.value as CredentialFieldType })
            }
            className="h-8 shrink-0 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="text">{c.fieldTypeText}</option>
            <option value="number">{c.fieldTypeNumber}</option>
            <option value="boolean">{c.fieldTypeBoolean}</option>
          </select>
          <Input
            type="password"
            value={field.value}
            onChange={(event) => update(index, { value: event.target.value })}
            placeholder={c.fieldValuePlaceholder}
            className="flex-1"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${c.removeFieldAria} ${field.key || index + 1}`}
            onClick={() => onChange(fields.filter((_, i) => i !== index))}
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange([...fields, { key: "", value: "", type: "text" }])}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
        {c.addField}
      </Button>
    </div>
  );
}

/** Resumo mascarado de uma conexao na lista, conforme o formato. */
function credentialSummaryLine(
  credential: CredentialSummary,
  moreFields: (count: number) => string,
): string {
  if (credential.kind !== "fields") {
    return `${credential.provider} · ••••${credential.lastFour ?? ""}`;
  }
  const keys = (credential.fieldsMeta ?? []).map((field) => field.key);
  const shown = keys.slice(0, 4).join(", ");
  const rest = keys.length - 4;
  return `${credential.provider} · ${shown}${rest > 0 ? `, ${moreFields(rest)}` : ""}`;
}

function ConnectionsSection() {
  const t = useDictionary();
  const c = t.settings.connections;
  const { data: credentials, isLoading } = useCredentials();
  const createCredential = useCreateCredential();
  const updateCredential = useUpdateCredential();
  const deleteCredential = useDeleteCredential();
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  /** Conexao em edicao — `null` significa "criando uma nova". */
  const [editing, setEditing] = useState<CredentialSummary | null>(null);
  const [provider, setProvider] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"secret" | "fields">("secret");
  const [value, setValue] = useState("");
  const [fields, setFields] = useState<CredentialFieldInput[]>([]);

  function resetForm() {
    setProvider("");
    setName("");
    setKind("secret");
    setValue("");
    setFields([]);
    setEditing(null);
  }

  function openCreate() {
    resetForm();
    setOpen(true);
  }

  function openEdit(credential: CredentialSummary) {
    setEditing(credential);
    setProvider(credential.provider);
    setName(credential.name);
    setKind(credential.kind);
    setValue("");
    // Chaves e TIPOS vem preenchidos; valores sempre em branco — o segredo
    // salvo nunca volta pro navegador. Sem carregar o tipo junto, editar
    // rebaixaria silenciosamente um campo numerico pra texto.
    setFields(
      (credential.fieldsMeta ?? []).map((field) => ({ ...field, value: "" })),
    );
    setOpen(true);
  }

  const filledFields = fields.filter((field) => field.key.trim());
  // Em edicao, deixar tudo em branco e valido: significa "mantenha o segredo".
  const secretReady = editing
    ? true
    : kind === "secret"
      ? !!value.trim()
      : filledFields.length > 0 && filledFields.every((field) => field.value);
  const canSubmit = !!provider.trim() && !!name.trim() && secretReady;

  async function onSubmit() {
    if (!canSubmit) return;
    const base = { provider: provider.trim(), name: name.trim() };
    // Em edicao, so manda o segredo se o usuario realmente digitou algo.
    const touchedSecret =
      kind === "secret" ? !!value.trim() : filledFields.some((field) => field.value);
    const secret =
      kind === "secret"
        ? ({ kind: "secret", value } as const)
        : ({ kind: "fields", fields: filledFields } as const);

    try {
      if (editing) {
        await updateCredential.mutateAsync({
          id: editing.id,
          ...base,
          ...(touchedSecret ? secret : {}),
        });
        toast.success(c.updatedToast);
      } else {
        await createCredential.mutateAsync({ ...base, ...secret });
        toast.success(c.createdToast);
      }
      resetForm();
      setOpen(false);
    } catch (error) {
      toast.error(
        errorMessage(error, editing ? c.updateErrorFallback : c.createErrorFallback),
      );
    }
  }

  async function onDelete() {
    if (!deleteId) return;
    try {
      await deleteCredential.mutateAsync(deleteId);
      toast.success(c.removedToast);
    } catch (error) {
      toast.error(errorMessage(error, c.removeErrorFallback));
    } finally {
      setDeleteId(null);
    }
  }

  if (isLoading) return <Skeleton className="h-16 rounded-lg" />;

  const pending = createCredential.isPending || updateCredential.isPending;

  return (
    <>
      {!credentials?.length ? (
        <EmptyState
          title={c.emptyTitle}
          description={c.emptyDescription}
          action={
            <Button size="sm" onClick={openCreate}>
              {c.add}
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {credentials.map((credential) => (
            <div
              key={credential.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{credential.name}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {credentialSummaryLine(credential, c.moreFields)}
                </p>
              </div>
              <div className="flex shrink-0 items-center">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${c.editAria} ${credential.name}`}
                  onClick={() => openEdit(credential)}
                >
                  <Pencil className="h-4 w-4" strokeWidth={1.5} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${c.removeAria} ${credential.name}`}
                  onClick={() => setDeleteId(credential.id)}
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                </Button>
              </div>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={openCreate}>
            {c.add}
          </Button>
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? c.editDialogTitle : c.dialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cred-provider">{c.providerLabel}</Label>
              <Input
                id="cred-provider"
                placeholder={c.providerPlaceholder}
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cred-name">{c.nameLabel}</Label>
              <Input
                id="cred-name"
                placeholder={c.namePlaceholder}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cred-kind">{c.kindLabel}</Label>
              <select
                id="cred-kind"
                value={kind}
                onChange={(event) => setKind(event.target.value as "secret" | "fields")}
                className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm"
              >
                <option value="secret">{c.kindSecret}</option>
                <option value="fields">{c.kindFields}</option>
              </select>
              <p className="text-xs text-muted-foreground">
                {kind === "secret" ? c.kindSecretHint : c.kindFieldsHint}
              </p>
            </div>

            {editing && <p className="text-xs text-muted-foreground">{c.editReplacesSecret}</p>}

            {kind === "secret" ? (
              <div className="space-y-1.5">
                <Label htmlFor="cred-value">{c.valueLabel}</Label>
                <Input
                  id="cred-value"
                  type="password"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>{c.fieldsLabel}</Label>
                <CredentialFieldsEditor fields={fields} onChange={setFields} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            {/* Desabilitado ate os obrigatorios estarem preenchidos — antes o
                submit era um no-op silencioso, sem nenhum feedback do que faltava. */}
            <Button onClick={onSubmit} disabled={pending || !canSubmit}>
              {pending
                ? editing
                  ? t.common.saving
                  : t.common.adding
                : editing
                  ? t.common.save
                  : t.common.add}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{c.removeConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{c.removeConfirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger/10 text-danger hover:bg-danger/20"
              onClick={onDelete}
            >
              {t.common.remove}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function VariablesSection() {
  const t = useDictionary();
  const { data: variables, isLoading } = useVariables();
  const createVariable = useCreateVariable();
  const deleteVariable = useDeleteVariable();
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [isSecret, setIsSecret] = useState(false);

  async function onCreate() {
    if (!key.trim() || !value.trim()) return;
    try {
      await createVariable.mutateAsync({ key: key.trim(), value, isSecret });
      toast.success(t.settings.variables.createdToast);
      setKey("");
      setValue("");
      setIsSecret(false);
      setOpen(false);
    } catch (error) {
      toast.error(errorMessage(error, t.settings.variables.createErrorFallback));
    }
  }

  async function onDelete() {
    if (!deleteId) return;
    try {
      await deleteVariable.mutateAsync(deleteId);
      toast.success(t.settings.variables.removedToast);
    } catch (error) {
      toast.error(errorMessage(error, t.settings.variables.removeErrorFallback));
    } finally {
      setDeleteId(null);
    }
  }

  if (isLoading) return <Skeleton className="h-16 rounded-lg" />;

  return (
    <>
      {!variables?.length ? (
        <EmptyState
          title={t.settings.variables.emptyTitle}
          description={t.settings.variables.emptyDescription}
          action={
            <Button size="sm" onClick={() => setOpen(true)}>
              {t.settings.variables.add}
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {variables.map((variable) => (
            <div
              key={variable.id}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2"
            >
              <div>
                <p className="font-mono text-sm font-medium text-foreground">{variable.key}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {variable.isSecret ? "••••••••" : variable.value} · {variable.scope}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${t.settings.variables.removeAria} ${variable.key}`}
                onClick={() => setDeleteId(variable.id)}
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            {t.settings.variables.add}
          </Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.settings.variables.dialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="var-key">{t.settings.variables.keyLabel}</Label>
              <Input
                id="var-key"
                placeholder={t.settings.variables.keyPlaceholder}
                value={key}
                onChange={(event) => setKey(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="var-value">{t.settings.variables.valueLabel}</Label>
              <Input
                id="var-value"
                type={isSecret ? "password" : "text"}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={isSecret}
                onChange={(event) => setIsSecret(event.target.checked)}
                className="h-4 w-4 rounded border-border-strong"
              />
              {t.settings.variables.secretCheckbox}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button onClick={onCreate} disabled={createVariable.isPending}>
              {createVariable.isPending ? t.common.adding : t.common.add}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.settings.variables.removeConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.settings.variables.removeConfirmDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger/10 text-danger hover:bg-danger/20"
              onClick={onDelete}
            >
              {t.common.remove}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function NodePresetsSection() {
  const t = useDictionary();
  const { data: presets, isLoading } = useNodePresets();
  const createPreset = useCreateNodePreset();
  const deletePreset = useDeleteNodePreset();
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [nodeType, setNodeType] = useState(NODE_CATALOG[0]?.type ?? "");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [configText, setConfigText] = useState("{}");
  const [configError, setConfigError] = useState<string | null>(null);

  function onConfigChange(value: string) {
    setConfigText(value);
    try {
      JSON.parse(value);
      setConfigError(null);
    } catch {
      setConfigError(t.settings.nodePresets.configInvalidError);
    }
  }

  async function onCreate() {
    if (!nodeType || !name.trim() || configError) return;
    try {
      const config = JSON.parse(configText) as Record<string, unknown>;
      await createPreset.mutateAsync({ nodeType, name: name.trim(), description: description.trim(), config });
      toast.success(t.settings.nodePresets.createdToast);
      setName("");
      setDescription("");
      setConfigText("{}");
      setOpen(false);
    } catch (error) {
      toast.error(errorMessage(error, t.settings.nodePresets.createErrorFallback));
    }
  }

  async function onDelete() {
    if (!deleteId) return;
    try {
      await deletePreset.mutateAsync(deleteId);
      toast.success(t.settings.nodePresets.removedToast);
    } catch (error) {
      toast.error(errorMessage(error, t.settings.nodePresets.removeErrorFallback));
    } finally {
      setDeleteId(null);
    }
  }

  if (isLoading) return <Skeleton className="h-16 rounded-lg" />;

  return (
    <>
      {!presets?.length ? (
        <EmptyState
          title={t.settings.nodePresets.emptyTitle}
          description={t.settings.nodePresets.emptyDescription}
          action={
            <Button size="sm" onClick={() => setOpen(true)}>
              {t.settings.nodePresets.add}
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {presets.map((preset) => (
            <div
              key={preset.id}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{preset.name}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {preset.nodeType}
                  {preset.description ? ` · ${preset.description}` : ""}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${t.settings.nodePresets.removeAria} ${preset.name}`}
                onClick={() => setDeleteId(preset.id)}
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            {t.settings.nodePresets.add}
          </Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.settings.nodePresets.dialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="preset-node-type">{t.settings.nodePresets.nodeTypeLabel}</Label>
              <select
                id="preset-node-type"
                value={nodeType}
                onChange={(event) => setNodeType(event.target.value)}
                className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm"
              >
                {NODE_CATALOG.map((entry) => (
                  <option key={entry.type} value={entry.type}>
                    {entry.label} ({entry.type})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="preset-name">{t.settings.nodePresets.nameLabel}</Label>
              <Input
                id="preset-name"
                placeholder={t.settings.nodePresets.namePlaceholder}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="preset-description">{t.settings.nodePresets.descriptionLabel}</Label>
              <Input
                id="preset-description"
                placeholder={t.settings.nodePresets.descriptionPlaceholder}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="preset-config">{t.settings.nodePresets.configLabel}</Label>
              <Textarea
                id="preset-config"
                rows={8}
                value={configText}
                onChange={(event) => onConfigChange(event.target.value)}
                className="font-mono text-xs"
              />
              {configError && <p className="text-xs text-danger">{configError}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button onClick={onCreate} disabled={createPreset.isPending || !!configError}>
              {createPreset.isPending ? t.common.creating : t.common.create}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.settings.nodePresets.removeConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.settings.nodePresets.removeConfirmDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger/10 text-danger hover:bg-danger/20"
              onClick={onDelete}
            >
              {t.common.remove}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function SettingsPage() {
  const t = useDictionary();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{t.settings.title}</h1>
        <p className="text-sm text-muted-foreground">{t.settings.description}</p>
      </div>

      <SettingsSection
        title={t.settings.appearance.title}
        description={t.settings.appearance.themeDescription}
      >
        <div className="flex flex-wrap items-center gap-3">
          <ThemeToggle />
          <span className="text-sm text-muted-foreground">
            {t.settings.appearance.themeDefaultNote}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <LanguageSelect />
        </div>
      </SettingsSection>

      <SettingsSection
        title={t.settings.connections.title}
        description={t.settings.connections.description}
      >
        <ConnectionsSection />
      </SettingsSection>

      <SettingsSection
        title={t.settings.variables.title}
        description={t.settings.variables.description}
      >
        <VariablesSection />
      </SettingsSection>

      <SettingsSection
        title={t.settings.nodePresets.title}
        description={t.settings.nodePresets.description}
      >
        <NodePresetsSection />
      </SettingsSection>
    </div>
  );
}
