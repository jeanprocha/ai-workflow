"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Send, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  useChatMessages,
  useCreateConversation,
  usePostVisitorMessage,
  type ChatMessage,
} from "@/hooks/use-chat";
import { ApiError } from "@/lib/errors";
import { useDictionary } from "@/lib/i18n";

const STORAGE_CHANGE_EVENT = "wf-chat-conversation-change";

function storageKey(chatToken: string) {
  return `wf.chat.${chatToken}`;
}

function subscribeToStorage(callback: () => void) {
  window.addEventListener(STORAGE_CHANGE_EVENT, callback);
  return () => window.removeEventListener(STORAGE_CHANGE_EVENT, callback);
}

function persistConversationId(chatToken: string, conversationId: string) {
  localStorage.setItem(storageKey(chatToken), conversationId);
  window.dispatchEvent(new Event(STORAGE_CHANGE_EVENT));
}

/** Retoma a conversa salva no localStorage (mesmo padrao de useTheme/useLocale: useSyncExternalStore, sem setState em effect). */
function useStoredConversationId(chatToken: string): string | null {
  return useSyncExternalStore(
    subscribeToStorage,
    () => localStorage.getItem(storageKey(chatToken)),
    () => null,
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isVisitor = message.role === "user";
  return (
    <div
      className={
        isVisitor
          ? "ml-8 rounded-lg bg-primary/10 px-3 py-2 text-sm text-foreground"
          : "mr-8 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
      }
    >
      <p className="whitespace-pre-wrap">{message.content}</p>
    </div>
  );
}

export function ChatConversation({ chatToken }: { chatToken: string }) {
  const t = useDictionary().chat.visitor;
  const conversationId = useStoredConversationId(chatToken);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const requestedRef = useRef(false);

  const createConversation = useCreateConversation(chatToken);
  const messages = useChatMessages(chatToken, conversationId);
  const postMessage = usePostVisitorMessage(chatToken, conversationId);

  // Nenhuma conversa salva ainda: cria uma nova (uma unica vez por token).
  // Le o localStorage DIRETO aqui (em vez de confiar em `conversationId`, que
  // vem do useSyncExternalStore e pode ainda refletir o getServerSnapshot no
  // instante em que este effect roda) — sem isso, um reload podia disparar
  // uma segunda criacao de conversa e sobrescrever a conversa salva por uma
  // nova vazia (bug real, pego pela suite E2E: 2 conversas no banco pra 1 reload).
  useEffect(() => {
    if (requestedRef.current || localStorage.getItem(storageKey(chatToken))) return;
    requestedRef.current = true;
    createConversation.mutate(undefined, {
      onSuccess: (result) => persistConversationId(chatToken, result.conversationId),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatToken]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.data?.length]);

  function send() {
    const content = draft.trim();
    if (!content || postMessage.isPending) return;
    setDraft("");
    postMessage.mutate(content);
  }

  const invalid =
    (createConversation.error instanceof ApiError && createConversation.error.status === 404) ||
    (messages.error instanceof ApiError && messages.error.status === 404);

  if (invalid) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
        <MessagesSquare className="size-8 text-muted-foreground" strokeWidth={1.5} />
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-foreground">{t.invalidTitle}</h1>
          <p className="max-w-sm text-sm text-muted-foreground">{t.invalidDescription}</p>
        </div>
      </div>
    );
  }

  const list = messages.data ?? [];
  const awaitingReply =
    postMessage.isPending || (list.length > 0 && list[list.length - 1].role === "user");
  const ready = conversationId !== null || createConversation.isSuccess;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <MessagesSquare className="size-4 text-primary" strokeWidth={1.5} />
        <span className="text-sm font-medium text-foreground">Chat</span>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {!ready || (messages.isLoading && list.length === 0) ? (
          <p className="text-center text-sm text-muted-foreground">{t.loading}</p>
        ) : (
          list.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
        {awaitingReply && (
          <div className="mr-8 flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
            <span className="sr-only">{t.typing}</span>
            <span className="flex gap-1" aria-hidden="true">
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 border-t border-border px-4 py-3">
        <Textarea
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t.placeholder}
          aria-label={t.placeholder}
          disabled={!ready}
          className="text-sm"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
        />
        <Button
          size="icon"
          aria-label={t.sendAria}
          onClick={send}
          disabled={!draft.trim() || postMessage.isPending || !ready}
        >
          <Send className="h-4 w-4" strokeWidth={1.5} />
        </Button>
      </div>
    </div>
  );
}
