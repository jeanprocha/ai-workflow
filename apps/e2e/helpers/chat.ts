import type { APIRequestContext } from "@playwright/test";
import { API_URL } from "./auth";

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

/** POST /public/chat/:chatToken/conversations — sem auth, so o token do node trigger.chat. */
export async function createChatConversation(
  request: APIRequestContext,
  chatToken: string,
): Promise<{ status: number; body: CreateConversationResult }> {
  const response = await request.post(`${API_URL}/public/chat/${chatToken}/conversations`);
  return { status: response.status(), body: await response.json() };
}

/**
 * POST .../messages — retorna a execucao criada (com `id`/`status`), pra
 * quem precisar esperar ela terminar (ver waitForExecutionStatus em
 * helpers/workflows.ts) ANTES de mandar a proxima mensagem. Esperar so a
 * mensagem do bot aparecer NAO basta: chat.reply grava a resposta no meio da
 * execucao (via RPC), antes do node seguinte (ex.: logic.setVariables) e do
 * persist final de $vars rodarem — checar so a mensagem cria uma race real
 * (achado ao vivo durante o desenvolvimento desta feature).
 */
export async function postVisitorMessage(
  request: APIRequestContext,
  chatToken: string,
  conversationId: string,
  content: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await request.post(
    `${API_URL}/public/chat/${chatToken}/conversations/${conversationId}/messages`,
    { data: { content } },
  );
  return { status: response.status(), body: await response.json() };
}

export async function listChatMessages(
  request: APIRequestContext,
  chatToken: string,
  conversationId: string,
): Promise<{ status: number; body: ChatMessage[] }> {
  const response = await request.get(
    `${API_URL}/public/chat/${chatToken}/conversations/${conversationId}/messages`,
  );
  return { status: response.status(), body: await response.json() };
}

export async function waitForChatMessageCount(
  request: APIRequestContext,
  chatToken: string,
  conversationId: string,
  minCount: number,
  timeoutMs = 20_000,
): Promise<ChatMessage[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { body: messages } = await listChatMessages(request, chatToken, conversationId);
    if (messages.length >= minCount) return messages;
    if (Date.now() > deadline) {
      throw new Error(
        `waitForChatMessageCount timeout: esperava >= ${minCount}, ultimo total foi ${messages.length}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

// --- Inbox (operador) ---

export interface InboxConversationSummary {
  id: string;
  status: string;
  channel: string;
  createdAt: string;
  updatedAt: string;
  lastMessage: ChatMessage | null;
}

export async function listInboxConversations(
  request: APIRequestContext,
  inboxToken: string,
): Promise<{ status: number; body: InboxConversationSummary[] }> {
  const response = await request.get(`${API_URL}/public/chat-inbox/${inboxToken}/conversations`);
  return { status: response.status(), body: await response.json() };
}

export async function getInboxConversation(
  request: APIRequestContext,
  inboxToken: string,
  conversationId: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await request.get(
    `${API_URL}/public/chat-inbox/${inboxToken}/conversations/${conversationId}`,
  );
  return { status: response.status(), body: await response.json() };
}

export async function postOperatorMessage(
  request: APIRequestContext,
  inboxToken: string,
  conversationId: string,
  content: string,
): Promise<{ status: number }> {
  const response = await request.post(
    `${API_URL}/public/chat-inbox/${inboxToken}/conversations/${conversationId}/messages`,
    { data: { content } },
  );
  return { status: response.status() };
}
