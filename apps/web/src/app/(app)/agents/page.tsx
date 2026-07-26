"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Bot, MessageCircle, Plus, Trash2 } from "lucide-react";
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
  useAgents,
  useChatWithAgent,
  useCreateAgent,
  useDeleteAgent,
  type Agent,
  type CreateAgentInput,
} from "@/hooks/use-agents";
import { useKnowledgeBases } from "@/hooks/use-knowledge";
import { useMcpServers } from "@/hooks/use-mcp";
import { errorMessage } from "@/lib/errors";
import { useDictionary } from "@/lib/i18n";

const MEMORY_TOOL_KEYS = ["memory_get", "memory_set"];

function displayTools(tools: string[]) {
  // `some`, nao `every`: o checkbox "Memoria persistente" sempre grava as duas
  // chaves juntas, mas um agente criado via API pode ter so uma delas — com
  // `every` a chave crua (memory_get) vazava como chip no card, em vez do
  // chip "memory" que o resto da UI usa.
  const hasMemory = MEMORY_TOOL_KEYS.some((key) => tools.includes(key));
  const rest = tools
    .filter((tool) => !MEMORY_TOOL_KEYS.includes(tool))
    .map((tool) => (tool.startsWith("mcp:") ? (tool.split(":")[2] ?? tool) : tool));
  return hasMemory ? [...rest, "memory"] : rest;
}

function CreateAgentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useDictionary();
  const AVAILABLE_TOOLS = [
    { key: "calculator", label: t.agents.tools.calculator },
    { key: "http", label: t.agents.tools.http },
    { key: "sql", label: t.agents.tools.sql },
    { key: "knowledge_base", label: t.agents.tools.knowledgeBase },
    { key: "memory", label: t.agents.tools.memory },
  ];
  const [form, setForm] = useState<CreateAgentInput>({
    name: "",
    description: "",
    systemPrompt: "",
    provider: "anthropic",
    model: "claude-sonnet-5",
    credential: "",
    temperature: 0.7,
    tools: [],
  });
  const createAgent = useCreateAgent();
  const { data: knowledgeBases } = useKnowledgeBases();
  const { data: mcpServers } = useMcpServers();

  function toggleTool(key: string) {
    const tools = form.tools ?? [];
    if (key === "memory") {
      const enabled = MEMORY_TOOL_KEYS.every((toolKey) => tools.includes(toolKey));
      setForm({
        ...form,
        tools: enabled
          ? tools.filter((t) => !MEMORY_TOOL_KEYS.includes(t))
          : [...tools, ...MEMORY_TOOL_KEYS.filter((t) => !tools.includes(t))],
      });
      return;
    }
    setForm({
      ...form,
      tools: tools.includes(key) ? tools.filter((t) => t !== key) : [...tools, key],
    });
  }

  function isToolChecked(key: string) {
    const tools = form.tools ?? [];
    return key === "memory"
      ? MEMORY_TOOL_KEYS.every((toolKey) => tools.includes(toolKey))
      : tools.includes(key);
  }

  async function onSubmit() {
    if (!form.name.trim() || !form.systemPrompt.trim() || !form.model.trim()) return;
    try {
      await createAgent.mutateAsync(form);
      toast.success(t.agents.createdToast);
      setForm({
        name: "",
        description: "",
        systemPrompt: "",
        provider: "anthropic",
        model: "claude-sonnet-5",
        credential: "",
        temperature: 0.7,
        tools: [],
      });
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error, t.agents.createErrorFallback));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.agents.createAgent}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label htmlFor="agent-name">{t.agents.form.nameLabel}</Label>
            <Input
              id="agent-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder={t.agents.form.namePlaceholder}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agent-description">{t.agents.form.descriptionLabel}</Label>
            <Input
              id="agent-description"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agent-prompt">{t.agents.form.systemPromptLabel}</Label>
            <Textarea
              id="agent-prompt"
              rows={4}
              value={form.systemPrompt}
              onChange={(event) => setForm({ ...form, systemPrompt: event.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="agent-provider">{t.agents.form.providerLabel}</Label>
              <select
                id="agent-provider"
                value={form.provider}
                onChange={(event) => setForm({ ...form, provider: event.target.value })}
                className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm"
              >
                {["anthropic", "openai", "gemini", "ollama"].map((provider) => (
                  <option key={provider} value={provider}>
                    {provider}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-model">{t.agents.form.modelLabel}</Label>
              <Input
                id="agent-model"
                value={form.model}
                onChange={(event) => setForm({ ...form, model: event.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agent-credential">{t.agents.form.credentialLabel}</Label>
            <Input
              id="agent-credential"
              value={form.credential}
              onChange={(event) => setForm({ ...form, credential: event.target.value })}
              placeholder={t.agents.form.credentialPlaceholder}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t.agents.form.toolsLabel}</Label>
            <div className="flex flex-wrap gap-3">
              {AVAILABLE_TOOLS.map((tool) => (
                <label key={tool.key} className="flex items-center gap-1.5 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={isToolChecked(tool.key)}
                    onChange={() => toggleTool(tool.key)}
                    className="h-4 w-4 rounded border-border-strong"
                  />
                  {tool.label}
                </label>
              ))}
            </div>
          </div>
          {isToolChecked("knowledge_base") && (
            <div className="space-y-1.5">
              <Label htmlFor="agent-kb">{t.agents.form.knowledgeBaseLabel}</Label>
              <select
                id="agent-kb"
                value={form.knowledgeBaseId ?? ""}
                onChange={(event) =>
                  setForm({ ...form, knowledgeBaseId: event.target.value || undefined })
                }
                className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm"
              >
                <option value="">{t.agents.form.knowledgeBaseSelectPlaceholder}</option>
                {knowledgeBases?.map((kb) => (
                  <option key={kb.id} value={kb.id}>
                    {kb.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!!mcpServers?.filter((server) => server.status === "connected").length && (
            <div className="space-y-1.5">
              <Label>{t.agents.form.mcpToolsLabel}</Label>
              <div className="flex flex-col gap-2">
                {mcpServers
                  .filter((server) => server.status === "connected")
                  .map((server) => (
                    <div key={server.id}>
                      <p className="text-xs text-muted-foreground">{server.name}</p>
                      <div className="flex flex-wrap gap-3">
                        {server.tools.map((tool) => {
                          const ref = `mcp:${server.id}:${tool.name}`;
                          return (
                            <label
                              key={ref}
                              className="flex items-center gap-1.5 text-sm text-foreground"
                            >
                              <input
                                type="checkbox"
                                checked={isToolChecked(ref)}
                                onChange={() => toggleTool(ref)}
                                className="h-4 w-4 rounded border-border-strong"
                              />
                              {tool.name}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button onClick={onSubmit} disabled={createAgent.isPending}>
            {createAgent.isPending ? t.common.creating : t.agents.createAgent}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TestAgentDialog({ agent, onOpenChange }: { agent: Agent | null; onOpenChange: (v: boolean) => void }) {
  const t = useDictionary();
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const chat = useChatWithAgent(agent?.id ?? "");

  async function onSend() {
    if (!message.trim()) return;
    try {
      const result = await chat.mutateAsync(message);
      setResponse(result.content);
    } catch (error) {
      toast.error(errorMessage(error, t.agents.chatErrorFallback));
    }
  }

  return (
    <Dialog open={!!agent} onOpenChange={(v) => !v && onOpenChange(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.agents.testDialog.title(agent?.name)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t.agents.testDialog.placeholder}
            aria-label={t.agents.testDialog.messageAria}
            rows={3}
          />
          {response && (
            <div className="rounded-md border border-border bg-muted p-3 text-sm text-foreground">
              {response}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.common.close}
          </Button>
          <Button onClick={onSend} disabled={chat.isPending || !message.trim()}>
            {chat.isPending ? t.agents.testDialog.sending : t.agents.testDialog.send}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AgentsPage() {
  const t = useDictionary();
  const { data: agents, isLoading } = useAgents();
  const deleteAgent = useDeleteAgent();
  const [createOpen, setCreateOpen] = useState(false);
  const [testTarget, setTestTarget] = useState<Agent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);

  async function onConfirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteAgent.mutateAsync(deleteTarget.id);
      toast.success(t.agents.deletedToast);
    } catch (error) {
      toast.error(errorMessage(error, t.agents.deleteErrorFallback));
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{t.agents.title}</h1>
          <p className="text-sm text-muted-foreground">{t.agents.description}</p>
        </div>
        {!!agents?.length && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            {t.agents.createAgent}
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && !agents?.length && (
        <EmptyState
          title={t.agents.emptyTitle}
          description={t.agents.emptyDescription}
          action={<Button onClick={() => setCreateOpen(true)}>{t.agents.createAgent}</Button>}
        />
      )}

      {!!agents?.length && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                  <h3 className="text-sm font-medium text-foreground">{agent.name}</h3>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${t.agents.deleteAria} ${agent.name}`}
                  onClick={() => setDeleteTarget(agent)}
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                </Button>
              </div>
              {agent.description && (
                <p className="text-xs text-muted-foreground">{agent.description}</p>
              )}
              <p className="font-mono text-xs text-muted-foreground">
                {agent.provider} · {agent.model}
              </p>
              {agent.tools.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {displayTools(agent.tools).map((tool) => (
                    <span
                      key={tool}
                      className="rounded-full bg-accent-subtle px-2 py-0.5 text-xs text-primary"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="mt-auto"
                onClick={() => setTestTarget(agent)}
              >
                <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
                {t.agents.test}
              </Button>
            </div>
          ))}
        </div>
      )}

      <CreateAgentDialog open={createOpen} onOpenChange={setCreateOpen} />
      <TestAgentDialog
        key={testTarget?.id ?? "none"}
        agent={testTarget}
        onOpenChange={() => setTestTarget(null)}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.agents.deleteConfirm.title(deleteTarget?.name)}</AlertDialogTitle>
            <AlertDialogDescription>{t.agents.deleteConfirm.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger/10 text-danger hover:bg-danger/20"
              onClick={onConfirmDelete}
            >
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
