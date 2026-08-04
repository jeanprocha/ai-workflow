"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Link2, Pencil, Plus, RotateCw, Trash2, X } from "lucide-react";
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
import { useOAuthProviders, useStartOAuth } from "@/hooks/use-oauth";
import { useCreateVariable, useDeleteVariable, useVariables } from "@/hooks/use-variables";
import { useCreateNodePreset, useDeleteNodePreset, useNodePresets } from "@/hooks/use-node-presets";
import {
  useAlertSettings,
  useSendTestAlert,
  useUpdateAlertSettings,
} from "@/hooks/use-alert-settings";
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
            onChange={(event) => update(index, { type: event.target.value as CredentialFieldType })}
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
  oauthConnectedLabel: string,
): string {
  if (credential.kind === "oauth") {
    // lastFour nunca e setado pro fluxo oauth (nao ha um "valor" pra mascarar).
    return `${credential.provider} · ${oauthConnectedLabel}`;
  }
  if (credential.kind !== "fields") {
    return `${credential.provider} · ••••${credential.lastFour ?? ""}`;
  }
  const keys = (credential.fieldsMeta ?? []).map((field) => field.key);
  const shown = keys.slice(0, 4).join(", ");
  const rest = keys.length - 4;
  return `${credential.provider} · ${shown}${rest > 0 ? `, ${moreFields(rest)}` : ""}`;
}

type OAuthDisplayStatus = "active" | "expired" | "error";

/** Deriva o badge de colunas em claro — nunca do blob cifrado. */
function oauthDisplayStatus(credential: CredentialSummary): OAuthDisplayStatus {
  if (credential.oauthStatus === "error") return "error";
  if (credential.oauthExpiresAt && new Date(credential.oauthExpiresAt).getTime() < Date.now()) {
    return "expired";
  }
  return "active";
}

const OAUTH_BADGE_STYLE: Record<OAuthDisplayStatus, string> = {
  active: "bg-success-subtle text-success",
  expired: "bg-warning-subtle text-warning",
  error: "bg-danger-subtle text-danger",
};

function OAuthStatusBadge({ credential }: { credential: CredentialSummary }) {
  const t = useDictionary();
  const c = t.settings.connections;
  const status = oauthDisplayStatus(credential);
  const label =
    status === "active"
      ? c.oauthStatusActive
      : status === "expired"
        ? c.oauthStatusExpired
        : c.oauthStatusError;
  const Icon = status === "active" ? Check : status === "expired" ? RotateCw : X;
  return (
    <span
      title={status === "error" ? (credential.oauthLastError ?? undefined) : undefined}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs ${OAUTH_BADGE_STYLE[status]}`}
    >
      <Icon className="h-3 w-3" strokeWidth={2.5} />
      {label}
    </span>
  );
}

/**
 * Le `?oauth=ok|erro&provider=` do retorno do callback (apps/api/src/oauth/
 * oauth.controller.ts). Dentro de um popup (window.opener existe), so avisa
 * quem abriu via postMessage e fecha — quem trata o toast/invalidacao e a
 * aba original (useOAuthPopupListener). Sem popup (bloqueado, ou o Google
 * navegou a mesma aba), trata aqui mesmo.
 *
 * useSearchParams exige Suspense em build de producao (Next 16) — por isso
 * este componente e isolado e so ele fica dentro do boundary.
 */
function OAuthReturnHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const t = useDictionary();
  const c = t.settings.connections;

  useEffect(() => {
    const status = searchParams.get("oauth");
    if (!status) return;
    const provider = searchParams.get("provider") ?? "";

    if (typeof window !== "undefined" && window.opener && window.opener !== window) {
      (window.opener as Window).postMessage(
        { type: "oauth-callback", status, provider },
        window.location.origin,
      );
      window.close();
      return;
    }

    if (status === "ok") {
      toast.success(c.oauthConnectedToast(provider));
    } else {
      toast.error(c.oauthErrorToast(provider));
    }
    queryClient.invalidateQueries({ queryKey: ["credentials"] });
    router.replace(pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return null;
}

/** Ouve o postMessage do popup (ver OAuthReturnHandler) na aba que iniciou a conexao. */
function useOAuthPopupListener() {
  const queryClient = useQueryClient();
  const t = useDictionary();
  const c = t.settings.connections;

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; status?: string; provider?: string } | null;
      if (data?.type !== "oauth-callback") return;
      if (data.status === "ok") {
        toast.success(c.oauthConnectedToast(data.provider ?? ""));
      } else {
        toast.error(c.oauthErrorToast(data.provider ?? ""));
      }
      queryClient.invalidateQueries({ queryKey: ["credentials"] });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function ConnectionsSection() {
  const t = useDictionary();
  const c = t.settings.connections;
  const { data: credentials, isLoading } = useCredentials();
  const createCredential = useCreateCredential();
  const updateCredential = useUpdateCredential();
  const deleteCredential = useDeleteCredential();
  const { data: oauthProviders } = useOAuthProviders();
  const startOAuth = useStartOAuth();
  useOAuthPopupListener();
  // Popup bloqueado pelo navegador: cai pra navegacao na mesma aba. A
  // mutacao de window.location fica isolada num efeito (react-hooks/
  // immutability nao deixa atribuir fora de um efeito dentro de componente).
  const [popupBlockedUrl, setPopupBlockedUrl] = useState<string | null>(null);
  useEffect(() => {
    if (popupBlockedUrl) window.location.href = popupBlockedUrl;
  }, [popupBlockedUrl]);
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
    // Conexao oauth nao passa por este form generico — usa "Reconectar".
    if (credential.kind === "oauth") return;
    setEditing(credential);
    setProvider(credential.provider);
    setName(credential.name);
    setKind(credential.kind);
    setValue("");
    // Chaves e TIPOS vem preenchidos; valores sempre em branco — o segredo
    // salvo nunca volta pro navegador. Sem carregar o tipo junto, editar
    // rebaixaria silenciosamente um campo numerico pra texto.
    setFields((credential.fieldsMeta ?? []).map((field) => ({ ...field, value: "" })));
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
      toast.error(errorMessage(error, editing ? c.updateErrorFallback : c.createErrorFallback));
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

  /**
   * `name` presente = reconectar a MESMA credencial (token expirado/erro);
   * ausente = conectar uma nova, com o nome default do backend (o proprio
   * provider). O popup pode ser bloqueado pelo navegador — `window.open`
   * devolve null nesse caso, e a navegacao cai pra mesma aba.
   */
  async function onConnect(provider: string, name?: string) {
    try {
      const { authorizeUrl } = await startOAuth.mutateAsync({ provider, name });
      const popup = window.open(authorizeUrl, "oauth-connect", "width=520,height=680");
      if (!popup) {
        setPopupBlockedUrl(authorizeUrl);
      }
    } catch (error) {
      toast.error(errorMessage(error, c.oauthStartErrorFallback));
    }
  }

  if (isLoading) return <Skeleton className="h-16 rounded-lg" />;

  const pending = createCredential.isPending || updateCredential.isPending;

  return (
    <>
      <Suspense fallback={null}>
        <OAuthReturnHandler />
      </Suspense>

      {!!oauthProviders?.length && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{c.oauthSectionTitle}</span>
          {oauthProviders.map((provider) => (
            <Button
              key={provider.provider}
              size="sm"
              variant="outline"
              disabled={startOAuth.isPending}
              aria-label={`${c.oauthConnectAria} ${provider.label}`}
              onClick={() => onConnect(provider.provider)}
            >
              <Link2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              {provider.label}
            </Button>
          ))}
        </div>
      )}

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
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-foreground">{credential.name}</p>
                  {credential.kind === "oauth" && <OAuthStatusBadge credential={credential} />}
                </div>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {credentialSummaryLine(credential, c.moreFields, c.oauthConnectedLabel)}
                </p>
              </div>
              <div className="flex shrink-0 items-center">
                {credential.kind === "oauth" ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${c.oauthReconnectAria} ${credential.name}`}
                    disabled={startOAuth.isPending}
                    onClick={() =>
                      onConnect(credential.oauthProvider ?? credential.provider, credential.name)
                    }
                  >
                    <RotateCw className="h-4 w-4" strokeWidth={1.5} />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${c.editAria} ${credential.name}`}
                    onClick={() => openEdit(credential)}
                  >
                    <Pencil className="h-4 w-4" strokeWidth={1.5} />
                  </Button>
                )}
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
      await createPreset.mutateAsync({
        nodeType,
        name: name.trim(),
        description: description.trim(),
        config,
      });
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

function AlertsSection() {
  const t = useDictionary();
  const a = t.settings.alerts;
  const { data, isLoading } = useAlertSettings();
  const updateSettings = useUpdateAlertSettings();
  const sendTest = useSendTestAlert();
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState("");
  // So sincroniza do servidor ANTES do usuario mexer no form — depois disso
  // o estado local e que manda, ate salvar (padrao das outras secoes, que
  // usam dialogs; aqui e inline, entao o guard e por referencia do `data`).
  const [hydrated, setHydrated] = useState(false);
  if (data && !hydrated) {
    setEmailEnabled(data.emailEnabled);
    setWebhookUrl(data.webhookUrl ?? "");
    setHydrated(true);
  }

  async function onSave() {
    try {
      await updateSettings.mutateAsync({
        emailEnabled,
        webhookUrl: webhookUrl.trim() ? webhookUrl.trim() : null,
      });
      toast.success(a.savedToast);
    } catch (error) {
      toast.error(errorMessage(error, a.saveErrorFallback));
    }
  }

  async function onSendTest() {
    try {
      await sendTest.mutateAsync({ webhookUrl: webhookUrl.trim() || undefined });
      toast.success(a.testSentToast);
    } catch (error) {
      toast.error(errorMessage(error, a.testErrorFallback));
    }
  }

  if (isLoading) return <Skeleton className="h-16 rounded-lg" />;

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={emailEnabled}
          onChange={(event) => setEmailEnabled(event.target.checked)}
          className="h-4 w-4 rounded border-border-strong"
        />
        {a.emailToggleLabel}
      </label>

      <div className="space-y-1.5">
        <Label htmlFor="alert-webhook">{a.webhookLabel}</Label>
        <Input
          id="alert-webhook"
          type="url"
          placeholder={a.webhookPlaceholder}
          value={webhookUrl}
          onChange={(event) => setWebhookUrl(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{a.webhookHint}</p>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={onSave} disabled={updateSettings.isPending}>
          {updateSettings.isPending ? a.saving : a.save}
        </Button>
        <Button variant="outline" onClick={onSendTest} disabled={sendTest.isPending}>
          {sendTest.isPending ? a.sendingTest : a.sendTest}
        </Button>
      </div>
    </div>
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

      <SettingsSection title={t.settings.alerts.title} description={t.settings.alerts.description}>
        <AlertsSection />
      </SettingsSection>
    </div>
  );
}
