import { test, expect } from "../../helpers/fixtures";
import { API_URL, buildTestUser, registerViaApi } from "../../helpers/auth";
import { fetchWorkspaceId, workspaceHeaders } from "../../helpers/settings";
import {
  chatGraph,
  createWorkflowViaApi,
  saveGraphViaApi,
  setWorkflowStatusViaApi,
  webhookGraph,
} from "../../helpers/workflows";
import {
  createChatConversation,
  listChatMessages,
  listInboxConversations,
  postVisitorMessage,
} from "../../helpers/chat";

/**
 * Fluxo arquivado (status "archived") deve parar de aceitar disparos
 * externos — webhook e chat publico — sem exigir nenhuma outra acao do
 * usuario. Antes desta correcao, arquivar so desligava o agendamento cron
 * (workflows.service.ts:143-155); webhook e chat continuavam criando
 * execucoes (e gastando tokens de IA) indefinidamente.
 */
test.describe("Fluxo arquivado para de disparar (webhook + chat)", () => {
  test("@smoke POST /hooks/:webhookId para de funcionar apos arquivar e volta ao reativar", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const workflow = await createWorkflowViaApi(
      request,
      tokens,
      workspaceId,
      "Gate de Webhook Arquivado",
    );
    const saved = await saveGraphViaApi(
      request,
      tokens,
      workspaceId,
      workflow.id,
      webhookGraph(),
    );
    expect(saved.webhookId).toBeTruthy();

    // Baseline: funciona antes de arquivar.
    const baseline = await request.post(`${API_URL}/hooks/${saved.webhookId}`, {
      data: {},
    });
    expect(baseline.status()).toBe(201);

    const before = await request.get(
      `${API_URL}/executions?workflowId=${workflow.id}`,
      { headers },
    );
    const totalBefore = (await before.json()).total as number;

    await setWorkflowStatusViaApi(
      request,
      tokens,
      workspaceId,
      workflow.id,
      "archived",
    );

    const whileArchived = await request.post(
      `${API_URL}/hooks/${saved.webhookId}`,
      { data: {} },
    );
    expect(whileArchived.status()).toBe(404);
    expect((await whileArchived.json()).message).toBe(
      "Webhook nao encontrado.",
    );

    const after = await request.get(
      `${API_URL}/executions?workflowId=${workflow.id}`,
      { headers },
    );
    expect((await after.json()).total).toBe(totalBefore);

    await setWorkflowStatusViaApi(
      request,
      tokens,
      workspaceId,
      workflow.id,
      "active",
    );

    const reactivated = await request.post(
      `${API_URL}/hooks/${saved.webhookId}`,
      { data: {} },
    );
    expect(reactivated.status()).toBe(201);
  });

  test("chat publico para de funcionar apos arquivar (inclusive leitura); inbox continua acessivel", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);

    const workflow = await createWorkflowViaApi(
      request,
      tokens,
      workspaceId,
      "Gate de Chat Arquivado",
    );
    const saved = await saveGraphViaApi(
      request,
      tokens,
      workspaceId,
      workflow.id,
      chatGraph(),
    );
    expect(saved.chatToken).toBeTruthy();
    expect(saved.inboxToken).toBeTruthy();

    const created = await createChatConversation(request, saved.chatToken!);
    expect(created.status).toBe(201);
    const conversationId = created.body.conversationId;

    await setWorkflowStatusViaApi(
      request,
      tokens,
      workspaceId,
      workflow.id,
      "archived",
    );

    const createWhileArchived = await createChatConversation(
      request,
      saved.chatToken!,
    );
    expect(createWhileArchived.status).toBe(404);
    expect(createWhileArchived.body).toMatchObject({
      message: "Link de chat invalido ou expirado.",
    });

    const messageWhileArchived = await postVisitorMessage(
      request,
      saved.chatToken!,
      conversationId,
      "oi",
    );
    expect(messageWhileArchived.status).toBe(404);

    const listWhileArchived = await listChatMessages(
      request,
      saved.chatToken!,
      conversationId,
    );
    expect(listWhileArchived.status).toBe(404);

    // Inbox NAO gateia: o operador precisa continuar lendo o historico de um
    // fluxo arquivado.
    const inbox = await listInboxConversations(request, saved.inboxToken!);
    expect(inbox.status).toBe(200);
    expect(inbox.body.map((c) => c.id)).toContain(conversationId);

    await setWorkflowStatusViaApi(
      request,
      tokens,
      workspaceId,
      workflow.id,
      "active",
    );

    const reactivated = await createChatConversation(request, saved.chatToken!);
    expect(reactivated.status).toBe(201);
  });
});
