"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProviderModelFields, type ProviderModelValue } from "@/components/ai/provider-model-fields";
import { useApplyCopilotSuggestion, useCopilotChat, type CopilotHistoryMessage } from "@/hooks/use-copilot";
import { ApiError } from "@/lib/api-client";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

interface DisplayMessage extends CopilotHistoryMessage {
  suggestionId?: string;
  applied?: boolean;
}

const SUGGESTED_PROMPTS = [
  "Como melhorar este fluxo?",
  "Existe um gargalo?",
  "Posso reduzir custos?",
  "Como deixar mais rapido?",
];

export function CopilotDialog({ workflowId }: { workflowId: string }) {
  const [open, setOpen] = useState(false);
  const [aiConfig, setAiConfig] = useState<ProviderModelValue>({
    provider: "anthropic",
    model: "claude-sonnet-5",
    credential: "",
  });
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const chat = useCopilotChat(workflowId);
  const applySuggestion = useApplyCopilotSuggestion(workflowId);

  async function sendMessage(text: string) {
    if (!text.trim() || !aiConfig.model.trim()) return;
    const history: CopilotHistoryMessage[] = messages.map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setMessage("");

    try {
      const result = await chat.mutateAsync({
        message: text,
        provider: aiConfig.provider,
        model: aiConfig.model.trim(),
        credential: aiConfig.credential.trim(),
        history,
      });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: result.content, suggestionId: result.suggestionId },
      ]);
    } catch (error) {
      toast.error(errorMessage(error, "Nao foi possivel conversar com o Copilot."));
      setMessages((prev) => prev.slice(0, -1));
    }
  }

  async function onApply(suggestionId: string) {
    try {
      await applySuggestion.mutateAsync(suggestionId);
      setMessages((prev) =>
        prev.map((item) =>
          item.suggestionId === suggestionId ? { ...item, applied: true } : item,
        ),
      );
      toast.success("Alteracao aplicada — recarregando o fluxo...");
      setTimeout(() => window.location.reload(), 800);
    } catch (error) {
      toast.error(errorMessage(error, "Nao foi possivel aplicar a sugestao."));
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
        Copilot
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-w-lg flex-col">
          <DialogHeader>
            <DialogTitle>
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-primary" strokeWidth={1.5} />
                Copilot
              </span>
            </DialogTitle>
          </DialogHeader>

          <ProviderModelFields idPrefix="copilot" value={aiConfig} onChange={setAiConfig} />

          <div className="max-h-80 min-h-[8rem] space-y-3 overflow-y-auto rounded-lg border border-border bg-muted p-3">
            {messages.length === 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Pergunte algo, ou tente:</p>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => sendMessage(prompt)}
                      className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground hover:border-border-strong"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((item, index) => (
                <div
                  key={index}
                  className={
                    item.role === "user"
                      ? "ml-6 rounded-lg bg-primary/10 p-2.5 text-sm text-foreground"
                      : "mr-6 rounded-lg border border-border bg-card p-2.5 text-sm text-foreground"
                  }
                >
                  <p className="whitespace-pre-wrap">{item.content}</p>
                  {item.suggestionId && (
                    <Button
                      size="sm"
                      variant={item.applied ? "secondary" : "outline"}
                      className="mt-2"
                      disabled={item.applied || applySuggestion.isPending}
                      onClick={() => onApply(item.suggestionId!)}
                    >
                      {item.applied ? "Aplicado" : "Aplicar mudanca no grafo"}
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="flex gap-2">
            <Textarea
              rows={2}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Pergunte sobre o fluxo..."
              className="text-sm"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage(message);
                }
              }}
            />
            <Button
              size="icon"
              onClick={() => sendMessage(message)}
              disabled={chat.isPending || !message.trim() || !aiConfig.model.trim()}
            >
              <Send className="h-4 w-4" strokeWidth={1.5} />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
