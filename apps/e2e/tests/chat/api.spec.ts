import { test, expect } from "../../helpers/fixtures";
import { buildTestUser, registerViaApi } from "../../helpers/auth";
import { fetchWorkspaceId, workspaceHeaders } from "../../helpers/settings";
import { API_URL } from "../../helpers/auth";
import {
  createWorkflowViaApi,
  saveGraphViaApi,
  waitForExecutionStatus,
  chatGraph,
  chatStatefulGraph,
  chatFailingGraph,
  chatWrongNodeIdGraph,
} from "../../helpers/workflows";
import {
  createChatConversation,
  postVisitorMessage,
  listChatMessages,
  waitForChatMessageCount,
  listInboxConversations,
  getInboxConversation,
  postOperatorMessage,
} from "../../helpers/chat";

/**
 * Fase Chat — endpoints publicos /public/chat/:chatToken e
 * /public/chat-inbox/:inboxToken (sem autenticacao, JwtAuthGuard bypassado
 * via @Public()). O rate limit em memoria por IP (chat-rate-limit.ts, mesmo
 * padrao do telemetry.controller.ts) NAO tem teste dedicado aqui, de
 * proposito: o contador e global por processo (nao por chatToken/conversa) e
 * a suite roda com fullyParallel — um teste que o esgota de proposito
 * contaminaria os outros testes de chat rodando em paralelo no mesmo
 * worker/processo. O telemetry.controller.ts, unico outro precedente do
 * mesmo padrao no repo, tambem nao tem teste E2E dedicado.
 */

async function setupChatWorkflow(
  request: Parameters<typeof createWorkflowViaApi>[0],
  tokens: Awaited<ReturnType<typeof registerViaApi>>,
  workspaceId: string,
  name: string,
  graph: unknown,
) {
  const workflow = await createWorkflowViaApi(request, tokens, workspaceId, name);
  const saved = await saveGraphViaApi(request, tokens, workspaceId, workflow.id, graph);
  if (!saved.chatToken || !saved.inboxToken) {
    throw new Error("saveGraphViaApi nao gerou chatToken/inboxToken — grafo sem trigger.chat?");
  }
  return { workflow, chatToken: saved.chatToken, inboxToken: saved.inboxToken };
}

test.describe("Chat (API)", () => {
  test("cria conversa e retorna a mensagem de boas-vindas configurada", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const { chatToken } = await setupChatWorkflow(
      request,
      tokens,
      workspaceId,
      "Chat Boas-vindas",
      chatGraph({ welcomeMessage: "Oi! Como posso ajudar?" }),
    );

    const { status, body } = await createChatConversation(request, chatToken);
    expect(status).toBe(201);
    expect(body.conversationId).toBeTruthy();
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]).toMatchObject({ role: "bot", content: "Oi! Como posso ajudar?" });
  });

  test("sem welcomeMessage configurada, a conversa comeca sem mensagens", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const { chatToken } = await setupChatWorkflow(
      request,
      tokens,
      workspaceId,
      "Chat Sem Boas-vindas",
      chatGraph(),
    );

    const { body } = await createChatConversation(request, chatToken);
    expect(body.messages).toEqual([]);
  });

  test("mensagem do visitante dispara execucao triggerType=chat; chat.reply responde com a expressao resolvida", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const { workflow, chatToken } = await setupChatWorkflow(
      request,
      tokens,
      workspaceId,
      "Chat Echo",
      chatGraph({ replyMessage: "Você disse: {{ $input.message }}" }),
    );

    const { body: conversation } = await createChatConversation(request, chatToken);
    const { status, body: execution } = await postVisitorMessage(
      request,
      chatToken,
      conversation.conversationId,
      "oi",
    );
    expect(status).toBe(201);
    expect(execution.triggerType).toBe("chat");

    await waitForExecutionStatus(
      request,
      tokens,
      workspaceId,
      execution.id as string,
      "success",
    );

    const messages = await waitForChatMessageCount(request, chatToken, conversation.conversationId, 2);
    expect(messages.map((m) => ({ role: m.role, content: m.content }))).toEqual([
      { role: "user", content: "oi" },
      { role: "bot", content: "Você disse: oi" },
    ]);

    // GET /executions confirma que a execucao pertence ao fluxo certo.
    const listResponse = await request.get(`${API_URL}/executions?workflowId=${workflow.id}`, {
      headers: workspaceHeaders(tokens, workspaceId),
    });
    const list = (await listResponse.json()) as { items: Array<{ triggerType: string }> };
    expect(list.items).toHaveLength(1);
    expect(list.items[0]!.triggerType).toBe("chat");
  });

  test("estado ($vars) persiste entre duas mensagens da mesma conversa", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const { chatToken } = await setupChatWorkflow(
      request,
      tokens,
      workspaceId,
      "Chat Estado",
      chatStatefulGraph(),
    );
    const { body: conversation } = await createChatConversation(request, chatToken);

    const first = await postVisitorMessage(request, chatToken, conversation.conversationId, "mensagem-A");
    await waitForExecutionStatus(request, tokens, workspaceId, first.body.id as string, "success");

    const second = await postVisitorMessage(request, chatToken, conversation.conversationId, "mensagem-B");
    await waitForExecutionStatus(request, tokens, workspaceId, second.body.id as string, "success");

    const messages = await waitForChatMessageCount(request, chatToken, conversation.conversationId, 4);
    expect(messages.map((m) => m.content)).toEqual([
      "mensagem-A",
      "Sua mensagem anterior foi: []",
      "mensagem-B",
      "Sua mensagem anterior foi: [mensagem-A]",
    ]);
  });

  test("falha no fluxo grava a errorMessage configurada — visitante nunca fica sem resposta", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const { chatToken } = await setupChatWorkflow(
      request,
      tokens,
      workspaceId,
      "Chat Falha Custom",
      chatFailingGraph("Ops, algo quebrou por aqui!"),
    );
    const { body: conversation } = await createChatConversation(request, chatToken);

    const { body: execution } = await postVisitorMessage(
      request,
      chatToken,
      conversation.conversationId,
      "oi",
    );
    await waitForExecutionStatus(request, tokens, workspaceId, execution.id as string, "failed");

    const messages = await waitForChatMessageCount(request, chatToken, conversation.conversationId, 2);
    expect(messages[1]).toMatchObject({ role: "bot", content: "Ops, algo quebrou por aqui!" });
  });

  test("falha sem errorMessage configurada usa a mensagem padrao", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const { chatToken } = await setupChatWorkflow(
      request,
      tokens,
      workspaceId,
      "Chat Falha Fallback",
      chatFailingGraph(""),
    );
    const { body: conversation } = await createChatConversation(request, chatToken);

    const { body: execution } = await postVisitorMessage(
      request,
      chatToken,
      conversation.conversationId,
      "oi",
    );
    await waitForExecutionStatus(request, tokens, workspaceId, execution.id as string, "failed");

    const messages = await waitForChatMessageCount(request, chatToken, conversation.conversationId, 2);
    expect(messages[1]).toMatchObject({
      role: "bot",
      content: "Desculpe, algo deu errado ao processar sua mensagem. Tente novamente em instantes.",
    });
  });

  test("chat.reply referenciando id de node inexistente falha com errorMessage — nunca um erro cru do Prisma", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const { chatToken } = await setupChatWorkflow(
      request,
      tokens,
      workspaceId,
      "Chat Id Inexistente",
      chatWrongNodeIdGraph("Desculpe, tive um problema — tente de novo em instantes."),
    );
    const { body: conversation } = await createChatConversation(request, chatToken);

    const { body: execution } = await postVisitorMessage(
      request,
      chatToken,
      conversation.conversationId,
      "oi",
    );
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id as string, "failed");
    // O erro registrado no step precisa nomear o id errado (prova que parou
    // no knownNodeIds, antes do execute do chat.reply) — nunca a mensagem
    // crua de um Prisma "Argument 'content' is missing".
    expect(done.error).toContain("n9NaoExiste");
    expect(done.error).not.toContain("Prisma");
    expect(done.error).not.toContain("prisma");

    const messages = await waitForChatMessageCount(request, chatToken, conversation.conversationId, 2);
    expect(messages[1]).toMatchObject({
      role: "bot",
      content: "Desculpe, tive um problema — tente de novo em instantes.",
    });
  });

  test("inbox lista conversas com a ultima mensagem e mostra o historico completo", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const { chatToken, inboxToken } = await setupChatWorkflow(
      request,
      tokens,
      workspaceId,
      "Chat Inbox Lista",
      chatGraph({ replyMessage: "Recebido: {{ $input.message }}" }),
    );

    const conversationA = (await createChatConversation(request, chatToken)).body;
    const conversationB = (await createChatConversation(request, chatToken)).body;
    const msgA = await postVisitorMessage(request, chatToken, conversationA.conversationId, "de A");
    await waitForExecutionStatus(request, tokens, workspaceId, msgA.body.id as string, "success");

    const { status, body: list } = await listInboxConversations(request, inboxToken);
    expect(status).toBe(200);
    expect(list).toHaveLength(2);
    const rowA = list.find((c) => c.id === conversationA.conversationId);
    const rowB = list.find((c) => c.id === conversationB.conversationId);
    expect(rowA?.lastMessage).toMatchObject({ role: "bot", content: "Recebido: de A" });
    expect(rowB?.lastMessage).toBeNull();

    const { status: detailStatus, body: detail } = await getInboxConversation(
      request,
      inboxToken,
      conversationA.conversationId,
    );
    expect(detailStatus).toBe(200);
    expect((detail.messages as unknown[]).length).toBe(2);
  });

  test("resposta manual do operador aparece pro visitante mas NAO dispara o fluxo de novo", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const { workflow, chatToken, inboxToken } = await setupChatWorkflow(
      request,
      tokens,
      workspaceId,
      "Chat Operador",
      chatGraph(),
    );
    const conversation = (await createChatConversation(request, chatToken)).body;
    const first = await postVisitorMessage(request, chatToken, conversation.conversationId, "oi");
    await waitForExecutionStatus(request, tokens, workspaceId, first.body.id as string, "success");

    const before = await request.get(`${API_URL}/executions?workflowId=${workflow.id}`, {
      headers: workspaceHeaders(tokens, workspaceId),
    });
    const beforeTotal = ((await before.json()) as { total: number }).total;

    const { status } = await postOperatorMessage(
      request,
      inboxToken,
      conversation.conversationId,
      "Aqui é o atendente, posso ajudar?",
    );
    expect(status).toBe(201);

    const messages = await waitForChatMessageCount(request, chatToken, conversation.conversationId, 3);
    expect(messages[2]).toMatchObject({
      role: "operator",
      content: "Aqui é o atendente, posso ajudar?",
    });

    const after = await request.get(`${API_URL}/executions?workflowId=${workflow.id}`, {
      headers: workspaceHeaders(tokens, workspaceId),
    });
    const afterTotal = ((await after.json()) as { total: number }).total;
    expect(afterTotal).toBe(beforeTotal);
  });

  test("chatToken invalido: 404 em pt e en", async ({ request }) => {
    const { status, body } = await createChatConversation(request, "token-que-nao-existe");
    expect(status).toBe(404);
    expect(body).toMatchObject({ message: "Link de chat invalido ou expirado." });

    const responseEn = await request.post(
      `${API_URL}/public/chat/token-que-nao-existe/conversations`,
      { headers: { "x-lang": "en" } },
    );
    expect(responseEn.status()).toBe(404);
    expect((await responseEn.json()).message).toBe("Invalid or expired chat link.");
  });

  test("inboxToken invalido: 404", async ({ request }) => {
    const { status, body } = await listInboxConversations(request, "token-que-nao-existe");
    expect(status).toBe(404);
    expect(body).toMatchObject({ message: "Link de inbox invalido ou expirado." });
  });

  test("conversationId de outro fluxo (chatToken diferente) da 404, nao vaza a conversa", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const flowA = await setupChatWorkflow(request, tokens, workspaceId, "Chat Isolamento A", chatGraph());
    const flowB = await setupChatWorkflow(request, tokens, workspaceId, "Chat Isolamento B", chatGraph());

    const conversationA = (await createChatConversation(request, flowA.chatToken)).body;

    const crossToken = await postVisitorMessage(
      request,
      flowB.chatToken,
      conversationA.conversationId,
      "oi",
    );
    expect(crossToken.status).toBe(404);
    expect(crossToken.body).toMatchObject({ message: "Conversa nao encontrada." });

    const crossList = await listChatMessages(request, flowB.chatToken, conversationA.conversationId);
    expect(crossList.status).toBe(404);
  });

  test("conteudo da mensagem: vazio ou acima de 4000 caracteres retorna 400", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const { chatToken } = await setupChatWorkflow(
      request,
      tokens,
      workspaceId,
      "Chat Validacao",
      chatGraph(),
    );
    const conversation = (await createChatConversation(request, chatToken)).body;

    const empty = await postVisitorMessage(request, chatToken, conversation.conversationId, "");
    expect(empty.status).toBe(400);

    const tooLong = await postVisitorMessage(
      request,
      chatToken,
      conversation.conversationId,
      "x".repeat(4001),
    );
    expect(tooLong.status).toBe(400);
  });
});
