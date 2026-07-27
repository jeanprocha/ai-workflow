import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

/** Endpoints publicos (sem auth) — sempre com withWorkspace/handleAuthErrors desligados. */
const PUBLIC_OPTS = { withWorkspace: false, handleAuthErrors: false } as const;

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: "user" | "bot" | "operator";
  content: string;
  executionId: string | null;
  createdAt: string;
}

export interface CreateConversationResult {
  conversationId: string;
  messages: ChatMessage[];
}

export interface InboxConversationSummary {
  id: string;
  status: string;
  channel: string;
  createdAt: string;
  updatedAt: string;
  lastMessage: ChatMessage | null;
}

export interface InboxConversationDetail {
  id: string;
  status: string;
  channel: string;
  state: unknown;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

// --- Visitante (/chat/[token]) ---

export function useCreateConversation(chatToken: string) {
  return useMutation({
    mutationFn: () =>
      apiFetch<CreateConversationResult>(
        `/public/chat/${chatToken}/conversations`,
        { method: "POST", ...PUBLIC_OPTS },
      ),
  });
}

export function useChatMessages(chatToken: string, conversationId: string | null) {
  return useQuery({
    queryKey: ["public-chat", chatToken, conversationId],
    queryFn: () =>
      apiFetch<ChatMessage[]>(
        `/public/chat/${chatToken}/conversations/${conversationId}/messages`,
        PUBLIC_OPTS,
      ),
    enabled: !!conversationId,
    refetchInterval: 2500,
    meta: { suppressErrorToast: true },
  });
}

export function usePostVisitorMessage(chatToken: string, conversationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      apiFetch(
        `/public/chat/${chatToken}/conversations/${conversationId}/messages`,
        { method: "POST", body: { content }, ...PUBLIC_OPTS },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["public-chat", chatToken, conversationId] }),
  });
}

// --- Operador (/inbox/[token]) ---

export function useInboxConversations(inboxToken: string) {
  return useQuery({
    queryKey: ["chat-inbox", inboxToken, "list"],
    queryFn: () =>
      apiFetch<InboxConversationSummary[]>(
        `/public/chat-inbox/${inboxToken}/conversations`,
        PUBLIC_OPTS,
      ),
    refetchInterval: 4000,
    meta: { suppressErrorToast: true },
  });
}

export function useInboxConversation(inboxToken: string, conversationId: string | null) {
  return useQuery({
    queryKey: ["chat-inbox", inboxToken, "detail", conversationId],
    queryFn: () =>
      apiFetch<InboxConversationDetail>(
        `/public/chat-inbox/${inboxToken}/conversations/${conversationId}`,
        PUBLIC_OPTS,
      ),
    enabled: !!conversationId,
    refetchInterval: 2500,
    meta: { suppressErrorToast: true },
  });
}

export function usePostOperatorMessage(inboxToken: string, conversationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      apiFetch(
        `/public/chat-inbox/${inboxToken}/conversations/${conversationId}/messages`,
        { method: "POST", body: { content }, ...PUBLIC_OPTS },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["chat-inbox", inboxToken, "detail", conversationId],
      });
      queryClient.invalidateQueries({ queryKey: ["chat-inbox", inboxToken, "list"] });
    },
  });
}
