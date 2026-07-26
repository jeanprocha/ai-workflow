"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Plug, Plus, RotateCw, Trash2, X } from "lucide-react";
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
import {
  useConnectMcpServer,
  useDisconnectMcpServer,
  useMcpServers,
  useReconnectMcpServer,
  useRemoveMcpServer,
  type ConnectMcpServerInput,
  type McpServer,
  type McpServerStatus,
} from "@/hooks/use-mcp";
import { errorMessage } from "@/lib/errors";
import { useDictionary } from "@/lib/i18n";

const STATUS_STYLE: Record<McpServerStatus, string> = {
  connecting: "bg-accent-subtle text-primary",
  connected: "bg-success-subtle text-success",
  disconnected: "bg-muted text-muted-foreground",
  error: "bg-danger-subtle text-danger",
};

function StatusBadge({ status }: { status: McpServerStatus }) {
  const t = useDictionary();
  const Icon = status === "connected" ? Check : status === "error" ? X : Loader2;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[status]}`}
    >
      <Icon
        className={`h-3 w-3 ${status === "connecting" ? "animate-spin" : ""}`}
        strokeWidth={2.5}
      />
      {t.mcp.statusLabel[status]}
    </span>
  );
}

function argsToText(args?: string[]) {
  return (args ?? []).join("\n");
}

function textToArgs(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function envToText(env?: Record<string, string>) {
  return Object.entries(env ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function textToEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key?.trim()) env[key.trim()] = rest.join("=").trim();
  }
  return env;
}

function ConnectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useDictionary();
  const [form, setForm] = useState<ConnectMcpServerInput>({
    name: "",
    transport: "stdio",
    command: "",
    args: [],
    env: {},
    url: "",
    headers: {},
  });
  const [argsText, setArgsText] = useState("");
  const [envText, setEnvText] = useState("");
  const connect = useConnectMcpServer();

  const presets: Array<{
    label: string;
    build: () => Partial<ConnectMcpServerInput>;
  }> = [
    {
      label: t.mcp.presets.filesystem,
      build: () => ({
        name: t.mcp.presets.filesystem,
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", t.mcp.presets.filesystemPath],
      }),
    },
    {
      label: t.mcp.presets.github,
      build: () => ({
        name: t.mcp.presets.github,
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: "" },
      }),
    },
    {
      label: t.mcp.presets.postgres,
      build: () => ({
        name: t.mcp.presets.postgres,
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-postgres", t.mcp.presets.postgresUrl],
      }),
    },
    {
      label: t.mcp.presets.browser,
      build: () => ({
        name: t.mcp.presets.browser,
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-puppeteer"],
      }),
    },
  ];

  function applyPreset(build: () => Partial<ConnectMcpServerInput>) {
    const preset = build();
    setForm((prev) => ({ ...prev, ...preset }));
    setArgsText(argsToText(preset.args));
    setEnvText(envToText(preset.env));
  }

  async function onSubmit() {
    if (!form.name.trim()) return;
    const payload: ConnectMcpServerInput = {
      ...form,
      args: form.transport === "stdio" ? textToArgs(argsText) : undefined,
      env: form.transport === "stdio" ? textToEnv(envText) : undefined,
    };
    try {
      const result = await connect.mutateAsync(payload);
      // connect() sempre responde 201 — falha de conexao vira status "error"
      // no proprio servidor retornado, nao uma excecao HTTP. Sem essa
      // checagem o toast dizia "conectado" mesmo quando o handshake falhou.
      if (result.status === "error") {
        toast.error(t.mcp.toasts.connectedWithError(result.lastError ?? t.mcp.toasts.connectError));
      } else {
        toast.success(t.mcp.toasts.connected);
      }
      setForm({ name: "", transport: "stdio", command: "", args: [], env: {}, url: "", headers: {} });
      setArgsText("");
      setEnvText("");
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error, t.mcp.toasts.connectError));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.mcp.dialog.title}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyPreset(preset.build)}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mcp-name">{t.mcp.dialog.nameLabel}</Label>
            <Input
              id="mcp-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder={t.mcp.dialog.namePlaceholder}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mcp-transport">{t.mcp.dialog.transportLabel}</Label>
            <select
              id="mcp-transport"
              value={form.transport}
              onChange={(event) =>
                setForm({ ...form, transport: event.target.value as ConnectMcpServerInput["transport"] })
              }
              className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm"
            >
              <option value="stdio">{t.mcp.dialog.transportStdio}</option>
              <option value="sse">{t.mcp.dialog.transportSse}</option>
              <option value="http">{t.mcp.dialog.transportHttp}</option>
            </select>
          </div>

          {form.transport === "stdio" ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="mcp-command">{t.mcp.dialog.commandLabel}</Label>
                <Input
                  id="mcp-command"
                  value={form.command}
                  onChange={(event) => setForm({ ...form, command: event.target.value })}
                  placeholder={t.mcp.dialog.commandPlaceholder}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mcp-args">{t.mcp.dialog.argsLabel}</Label>
                <Textarea
                  id="mcp-args"
                  rows={3}
                  className="font-mono text-xs"
                  value={argsText}
                  onChange={(event) => setArgsText(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mcp-env">{t.mcp.dialog.envLabel}</Label>
                <Textarea
                  id="mcp-env"
                  rows={2}
                  className="font-mono text-xs"
                  value={envText}
                  onChange={(event) => setEnvText(event.target.value)}
                />
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="mcp-url">{t.mcp.dialog.urlLabel}</Label>
              <Input
                id="mcp-url"
                value={form.url}
                onChange={(event) => setForm({ ...form, url: event.target.value })}
                placeholder={t.mcp.dialog.urlPlaceholder}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button onClick={onSubmit} disabled={connect.isPending || !form.name.trim()}>
            {connect.isPending ? t.mcp.dialog.connecting : t.mcp.dialog.connect}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function McpPage() {
  const t = useDictionary();
  const { data: servers, isLoading } = useMcpServers();
  const reconnect = useReconnectMcpServer();
  const disconnect = useDisconnectMcpServer();
  const remove = useRemoveMcpServer();
  const [connectOpen, setConnectOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<McpServer | null>(null);

  async function onReconnect(id: string) {
    try {
      await reconnect.mutateAsync(id);
      toast.success(t.mcp.toasts.reconnected);
    } catch (error) {
      toast.error(errorMessage(error, t.mcp.toasts.reconnectError));
    }
  }

  async function onDisconnect(id: string) {
    try {
      await disconnect.mutateAsync(id);
      toast.success(t.mcp.toasts.disconnected);
    } catch (error) {
      toast.error(errorMessage(error, t.mcp.toasts.disconnectError));
    }
  }

  async function onConfirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success(t.mcp.toasts.removed);
    } catch (error) {
      toast.error(errorMessage(error, t.mcp.toasts.removeError));
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{t.mcp.title}</h1>
          <p className="text-sm text-muted-foreground">{t.mcp.description}</p>
        </div>
        {!!servers?.length && (
          <Button onClick={() => setConnectOpen(true)}>
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            {t.mcp.connectServer}
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && !servers?.length && (
        <EmptyState
          title={t.mcp.empty.title}
          description={t.mcp.empty.description}
          action={<Button onClick={() => setConnectOpen(true)}>{t.mcp.connectServer}</Button>}
        />
      )}

      {!!servers?.length && (
        <div className="space-y-3">
          {servers.map((server) => (
            <div key={server.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Plug className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                  <h3 className="text-sm font-medium text-foreground">{server.name}</h3>
                  <StatusBadge status={server.status} />
                  <span className="text-xs text-muted-foreground">{server.transport}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${t.mcp.reconnectTooltip} ${server.name}`}
                    onClick={() => onReconnect(server.id)}
                    disabled={reconnect.isPending}
                    title={t.mcp.reconnectTooltip}
                  >
                    <RotateCw className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </Button>
                  {server.status !== "disconnected" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`${t.mcp.disconnect} ${server.name}`}
                      onClick={() => onDisconnect(server.id)}
                      disabled={disconnect.isPending}
                    >
                      {t.mcp.disconnect}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${t.mcp.removeAria} ${server.name}`}
                    onClick={() => setDeleteTarget(server)}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </Button>
                </div>
              </div>

              {server.lastError && (
                <p className="mt-2 font-mono text-xs text-danger">{server.lastError}</p>
              )}

              {!!server.tools.length && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {server.tools.map((tool) => (
                    <span
                      key={tool.id}
                      title={tool.description ?? undefined}
                      className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                    >
                      {tool.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.mcp.deleteConfirm.title(deleteTarget?.name)}</AlertDialogTitle>
            <AlertDialogDescription>{t.mcp.deleteConfirm.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger/10 text-danger hover:bg-danger/20"
              onClick={onConfirmDelete}
            >
              {t.common.remove}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
