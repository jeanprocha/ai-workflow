import { test, expect } from "../../helpers/fixtures";
import { API_URL, buildTestUser, registerViaApi } from "../../helpers/auth";
import { fetchWorkspaceId, workspaceHeaders } from "../../helpers/settings";
import {
  createWorkflowViaApi,
  saveGraphViaApi,
  runWorkflowViaApi,
  waitForExecutionStatus,
  errorBranchGraph,
  chatErrorBranchGraph,
} from "../../helpers/workflows";
import { createChatConversation, postVisitorMessage, waitForChatMessageCount } from "../../helpers/chat";

/**
 * Caminho de erro por node (onError:'branch') — quando um node falha (apos
 * retries) e tem uma edge sourceHandle="error" conectada, a execucao roteia
 * por ela em vez de derrubar tudo (fail-fast e a unica politica sem isso).
 * Ver docs/produto/base-evolucao.md C3.
 */

const ECHO_URL = `${API_URL}/debug/echo`;

test.describe("Caminho de erro (onError: branch)", () => {
  test("falha tratada: execucao termina success, node de erro roda com o payload, caminho normal nao roda", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Caminho de Erro - Feliz");
    await saveGraphViaApi(
      request,
      tokens,
      workspaceId,
      workflow.id,
      errorBranchGraph({ onError: "branch" }),
    );

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "success");
    const detail = await (await request.get(`${API_URL}/executions/${done.id}`, { headers })).json();

    const stepsByNode = new Map(detail.steps.map((s: { nodeId: string }) => [s.nodeId, s]));
    expect((stepsByNode.get("n2") as { status: string }).status).toBe("failed");
    expect(stepsByNode.has("n3")).toBe(false);
    const errorStep = stepsByNode.get("n4") as { status: string; output: unknown };
    expect(errorStep.status).toBe("success");
    expect(errorStep.output).toContain("tratado:");
    expect(done.error).toBeNull();
  });

  test("onError:'branch' sem edge de erro conectada mantem o fail-fast", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Caminho de Erro - Sem Edge");
    await saveGraphViaApi(
      request,
      tokens,
      workspaceId,
      workflow.id,
      errorBranchGraph({ onError: "branch", wireErrorEdge: false }),
    );

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "failed");
    expect(done.error).toBeTruthy();
  });

  test("regressao: sem onError, a falha derruba a execucao normalmente", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Caminho de Erro - Fail Fast");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, errorBranchGraph());

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "failed");
    expect(done.error).toBeTruthy();
  });

  test("node saudavel com caminho de erro habilitado: so o caminho normal roda", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Caminho de Erro - Node Saudavel");
    await saveGraphViaApi(
      request,
      tokens,
      workspaceId,
      workflow.id,
      errorBranchGraph({ onError: "branch", url: ECHO_URL }),
    );

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "success");
    const detail = await (await request.get(`${API_URL}/executions/${done.id}`, { headers })).json();

    const stepsByNode = new Map(detail.steps.map((s: { nodeId: string }) => [s.nodeId, s]));
    expect((stepsByNode.get("n3") as { status: string }).status).toBe("success");
    expect(stepsByNode.has("n4")).toBe(false);
  });

  test("chat: erro tratado responde pelo caminho de erro, sem a errorMessage do trigger, e persiste o estado", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Caminho de Erro - Chat");
    const saved = await saveGraphViaApi(
      request,
      tokens,
      workspaceId,
      workflow.id,
      chatErrorBranchGraph("Isso nunca deveria aparecer."),
    );
    if (!saved.chatToken) throw new Error("saveGraphViaApi nao gerou chatToken.");

    const { body: conversation } = await createChatConversation(request, saved.chatToken);
    const { body: execution } = await postVisitorMessage(
      request,
      saved.chatToken,
      conversation.conversationId,
      "oi",
    );
    await waitForExecutionStatus(request, tokens, workspaceId, execution.id as string, "success");

    const messages = await waitForChatMessageCount(request, saved.chatToken, conversation.conversationId, 2);
    expect(messages[1]).toMatchObject({ role: "bot", content: "Tive um problema, mas contornei." });
  });
});
