"use client";

import { useState } from "react";
import { ArrowLeft, Inbox, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useInboxConversation,
  useInboxConversations,
  usePostOperatorMessage,
  type ChatMessage,
  type InboxConversationSummary,
} from "@/hooks/use-chat";
import { ApiError } from "@/lib/errors";
import { useDictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function ConversationRow({
  conversation,
  active,
  onSelect,
  roleLabels,
  lastMessageEmpty,
}: {
  conversation: InboxConversationSummary;
  active: boolean;
  onSelect: () => void;
  roleLabels: Record<"user" | "bot" | "operator", string>;
  lastMessageEmpty: string;
}) {
  const last = conversation.lastMessage;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full flex-col gap-0.5 border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-muted",
        active && "bg-muted",
      )}
    >
      <span className="text-xs font-medium text-muted-foreground">
        {new Date(conversation.updatedAt).toLocaleString()}
      </span>
      <span className="truncate text-sm text-foreground">
        {last ? `${roleLabels[last.role]}: ${last.content}` : lastMessageEmpty}
      </span>
    </button>
  );
}

function MessageBubble({
  message,
  roleLabels,
}: {
  message: ChatMessage;
  roleLabels: Record<"user" | "bot" | "operator", string>;
}) {
  const align =
    message.role === "user" ? "mr-8" : message.role === "operator" ? "ml-8" : "mr-8";
  const tone =
    message.role === "operator"
      ? "border-primary/40 bg-primary/10"
      : message.role === "user"
        ? "border-border bg-card"
        : "border-border bg-muted";
  return (
    <div className={cn("rounded-lg border px-3 py-2 text-sm text-foreground", align, tone)}>
      <p className="mb-0.5 text-xs font-medium text-muted-foreground">{roleLabels[message.role]}</p>
      <p className="whitespace-pre-wrap">{message.content}</p>
    </div>
  );
}

function ConversationThread({
  inboxToken,
  conversationId,
  onBack,
}: {
  inboxToken: string;
  conversationId: string;
  onBack: () => void;
}) {
  const t = useDictionary().chat.inbox;
  const [draft, setDraft] = useState("");
  const conversation = useInboxConversation(inboxToken, conversationId);
  const postMessage = usePostOperatorMessage(inboxToken, conversationId);

  function send() {
    const content = draft.trim();
    if (!content || postMessage.isPending) return;
    setDraft("");
    postMessage.mutate(content);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 md:hidden">
        <Button variant="ghost" size="icon-sm" aria-label={t.backToList} onClick={onBack}>
          <ArrowLeft className="size-4" strokeWidth={1.5} />
        </Button>
        <span className="text-sm font-medium text-foreground">{t.title}</span>
      </div>

      <ScrollArea className="flex-1 px-4 py-4">
        <div className="space-y-3">
          {conversation.isLoading && !conversation.data ? (
            <p className="text-center text-sm text-muted-foreground">{t.loading}</p>
          ) : (
            conversation.data?.messages.map((message) => (
              <MessageBubble key={message.id} message={message} roleLabels={t.roleLabels} />
            ))
          )}
        </div>
      </ScrollArea>

      <div className="flex gap-2 border-t border-border px-4 py-3">
        <Textarea
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t.operatorPlaceholder}
          aria-label={t.operatorPlaceholder}
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
          aria-label={t.operatorSendAria}
          onClick={send}
          disabled={!draft.trim() || postMessage.isPending}
        >
          <Send className="h-4 w-4" strokeWidth={1.5} />
        </Button>
      </div>
    </div>
  );
}

export function InboxView({ inboxToken }: { inboxToken: string }) {
  const t = useDictionary().chat.inbox;
  const [selected, setSelected] = useState<string | null>(null);
  const conversations = useInboxConversations(inboxToken);

  if (conversations.error instanceof ApiError && conversations.error.status === 404) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
        <Inbox className="size-8 text-muted-foreground" strokeWidth={1.5} />
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-foreground">{t.invalidTitle}</h1>
          <p className="max-w-sm text-sm text-muted-foreground">{t.invalidDescription}</p>
        </div>
      </div>
    );
  }

  const list = conversations.data ?? [];

  return (
    <div className="flex min-h-dvh flex-col md:h-dvh md:flex-row">
      <div
        className={cn(
          "flex w-full flex-col border-border md:w-80 md:shrink-0 md:border-r",
          selected && "hidden md:flex",
        )}
      >
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Inbox className="size-4 text-primary" strokeWidth={1.5} />
          <span className="text-sm font-medium text-foreground">{t.title}</span>
        </header>
        {list.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 px-4 text-center">
            <p className="text-sm font-medium text-foreground">{t.emptyTitle}</p>
            <p className="text-sm text-muted-foreground">{t.emptyDescription}</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {list.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                active={conversation.id === selected}
                onSelect={() => setSelected(conversation.id)}
                roleLabels={t.roleLabels}
                lastMessageEmpty={t.lastMessageEmpty}
              />
            ))}
          </div>
        )}
      </div>

      <div className={cn("flex-1", !selected && "hidden md:flex md:items-center md:justify-center")}>
        {selected ? (
          <ConversationThread
            inboxToken={inboxToken}
            conversationId={selected}
            onBack={() => setSelected(null)}
          />
        ) : (
          <p className="hidden text-sm text-muted-foreground md:block">{t.selectConversationHint}</p>
        )}
      </div>
    </div>
  );
}
