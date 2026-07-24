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
import { ApiError } from "@/lib/api-client";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

const PRESETS: Array<{
  label: string;
  build: () => Partial<ConnectMcpServerInput>;
}> = [
  {
    label: "Filesystem",
    build: () => ({
      name: "Filesystem",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/caminho/permitido"],
    }),
  },
  {
    label: "GitHub",
    build: () => ({
      name: "GitHub",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: "" },
    }),
  },
  {
    label: "Postgres",
    build: () => ({
      name: "Postgres",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-postgres", "postgresql://user:senha@host:5432/db"],
    }),
  },
  {
    label: "Browser",
    build: () => ({
      name: "Browser",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-puppeteer"],
    }),
  },
];

const STATUS_LABEL: Record<McpServerStatus, string> = {
  connecting: "Conectando",
  connected: "Conectado",
  disconnected: "Desconectado",
  error: "Erro",
};

const STATUS_STYLE: Record<McpServerStatus, string> = {
  connecting: "bg-accent-subtle text-primary",
  connected: "bg-success-subtle text-success",
  disconnected: "bg-muted text-muted-foreground",
  error: "bg-danger-subtle text-danger",
};

function StatusBadge({ status }: { status: McpServerStatus }) {
  const Icon = status === "connected" ? Check : status === "error" ? X : Loader2;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[status]}`}
    >
      <Icon
        className={`h-3 w-3 ${status === "connecting" ? "animate-spin" : ""}`}
        strokeWidth={2.5}
      />
      {STATUS_LABEL[status]}
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
      await connect.mutateAsync(payload);
      toast.success("Servidor MCP conectado.");
      setForm({ name: "", transport: "stdio", command: "", args: [], env: {}, url: "", headers: {} });
      setArgsText("");
      setEnvText("");
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error, "Nao foi possivel conectar ao servidor MCP."));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conectar servidor MCP</DialogTitle>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
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
            <Label htmlFor="mcp-name">Nome</Label>
            <Input
              id="mcp-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Ex: Filesystem"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mcp-transport">Transport</Label>
            <select
              id="mcp-transport"
              value={form.transport}
              onChange={(event) =>
                setForm({ ...form, transport: event.target.value as ConnectMcpServerInput["transport"] })
              }
              className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm"
            >
              <option value="stdio">stdio (processo local)</option>
              <option value="sse">SSE (servidor remoto)</option>
              <option value="http">HTTP (servidor remoto)</option>
            </select>
          </div>

          {form.transport === "stdio" ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="mcp-command">Comando</Label>
                <Input
                  id="mcp-command"
                  value={form.command}
                  onChange={(event) => setForm({ ...form, command: event.target.value })}
                  placeholder="npx"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mcp-args">Argumentos (um por linha)</Label>
                <Textarea
                  id="mcp-args"
                  rows={3}
                  className="font-mono text-xs"
                  value={argsText}
                  onChange={(event) => setArgsText(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mcp-env">Variaveis de ambiente (CHAVE=valor por linha)</Label>
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
              <Label htmlFor="mcp-url">URL</Label>
              <Input
                id="mcp-url"
                value={form.url}
                onChange={(event) => setForm({ ...form, url: event.target.value })}
                placeholder="https://meu-servidor-mcp.com/sse"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={connect.isPending || !form.name.trim()}>
            {connect.isPending ? "Conectando..." : "Conectar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function McpPage() {
  const { data: servers, isLoading } = useMcpServers();
  const reconnect = useReconnectMcpServer();
  const disconnect = useDisconnectMcpServer();
  const remove = useRemoveMcpServer();
  const [connectOpen, setConnectOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<McpServer | null>(null);

  async function onReconnect(id: string) {
    try {
      await reconnect.mutateAsync(id);
      toast.success("Reconectado.");
    } catch (error) {
      toast.error(errorMessage(error, "Nao foi possivel reconectar."));
    }
  }

  async function onDisconnect(id: string) {
    try {
      await disconnect.mutateAsync(id);
      toast.success("Desconectado.");
    } catch (error) {
      toast.error(errorMessage(error, "Nao foi possivel desconectar."));
    }
  }

  async function onConfirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Servidor removido.");
    } catch (error) {
      toast.error(errorMessage(error, "Nao foi possivel remover o servidor."));
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">MCP</h1>
          <p className="text-sm text-muted-foreground">
            Servidores Model Context Protocol conectados ao workspace.
          </p>
        </div>
        {!!servers?.length && (
          <Button onClick={() => setConnectOpen(true)}>
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Conectar servidor
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
          title="Nenhum servidor MCP conectado"
          description="Conecte um servidor Filesystem, GitHub, Postgres ou Browser para dar novas ferramentas aos seus agentes e fluxos."
          action={<Button onClick={() => setConnectOpen(true)}>Conectar servidor</Button>}
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
                    onClick={() => onReconnect(server.id)}
                    disabled={reconnect.isPending}
                    title="Reconectar"
                  >
                    <RotateCw className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </Button>
                  {server.status !== "disconnected" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDisconnect(server.id)}
                      disabled={disconnect.isPending}
                    >
                      Desconectar
                    </Button>
                  )}
                  <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(server)}>
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
            <AlertDialogTitle>Remover o servidor &ldquo;{deleteTarget?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              Agentes e fluxos que usam tools deste servidor deixarao de funcionar. Esta acao nao
              pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger/10 text-danger hover:bg-danger/20"
              onClick={onConfirmDelete}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
