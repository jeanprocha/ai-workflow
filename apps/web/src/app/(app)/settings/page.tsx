"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
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

function ConnectionsSection() {
  const t = useDictionary();
  const { data: credentials, isLoading } = useCredentials();
  const createCredential = useCreateCredential();
  const deleteCredential = useDeleteCredential();
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [provider, setProvider] = useState("");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");

  async function onCreate() {
    if (!provider.trim() || !name.trim() || !value.trim()) return;
    try {
      await createCredential.mutateAsync({ provider: provider.trim(), name: name.trim(), value });
      toast.success(t.settings.connections.createdToast);
      setProvider("");
      setName("");
      setValue("");
      setOpen(false);
    } catch (error) {
      toast.error(errorMessage(error, t.settings.connections.createErrorFallback));
    }
  }

  async function onDelete() {
    if (!deleteId) return;
    try {
      await deleteCredential.mutateAsync(deleteId);
      toast.success(t.settings.connections.removedToast);
    } catch (error) {
      toast.error(errorMessage(error, t.settings.connections.removeErrorFallback));
    } finally {
      setDeleteId(null);
    }
  }

  if (isLoading) return <Skeleton className="h-16 rounded-lg" />;

  return (
    <>
      {!credentials?.length ? (
        <EmptyState
          title={t.settings.connections.emptyTitle}
          description={t.settings.connections.emptyDescription}
          action={
            <Button size="sm" onClick={() => setOpen(true)}>
              {t.settings.connections.add}
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {credentials.map((credential) => (
            <div
              key={credential.id}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{credential.name}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {credential.provider} · ••••{credential.lastFour}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${t.settings.connections.removeAria} ${credential.name}`}
                onClick={() => setDeleteId(credential.id)}
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            {t.settings.connections.add}
          </Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.settings.connections.dialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cred-provider">{t.settings.connections.providerLabel}</Label>
              <Input
                id="cred-provider"
                placeholder={t.settings.connections.providerPlaceholder}
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cred-name">{t.settings.connections.nameLabel}</Label>
              <Input
                id="cred-name"
                placeholder={t.settings.connections.namePlaceholder}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cred-value">{t.settings.connections.valueLabel}</Label>
              <Input
                id="cred-value"
                type="password"
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button onClick={onCreate} disabled={createCredential.isPending}>
              {createCredential.isPending ? t.common.adding : t.common.add}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.settings.connections.removeConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.settings.connections.removeConfirmDescription}
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
