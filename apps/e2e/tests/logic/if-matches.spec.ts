import { test, expect } from "../../helpers/fixtures";
import { API_URL, buildTestUser, registerViaApi } from "../../helpers/auth";
import { fetchWorkspaceId, workspaceHeaders } from "../../helpers/settings";
import { createWorkflowViaApi, saveGraphViaApi, runWorkflowViaApi, waitForExecutionStatus } from "../../helpers/workflows";

/**
 * Operador "matches" do node If — regex deterministica, sem custo de IA.
 * Motivacao real: decidir se a mensagem do cliente e um codigo de produto
 * puro (`^\d+$`) antes de escolher entre busca por codigo ou por nome, no
 * fluxo de vendas (ver "vamos finalizar o fluxo").
 */

function ifGraph(left: string, operator: string, right: string) {
  return {
    nodes: [
      {
        id: "n1",
        type: "trigger.manual",
        category: "trigger",
        label: "Manual Trigger",
        position: { x: 0, y: 0 },
        config: {},
      },
      {
        id: "n2",
        type: "logic.if",
        category: "logic",
        label: "If",
        position: { x: 320, y: 0 },
        config: { left, operator, right },
      },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2" }],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

test.describe("Node If — operador matches (regex)", () => {
  test("codigo numerico puro bate com ^\\d+$ — branch true", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "If Matches Codigo");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, ifGraph("30342", "matches", "^\\d+$"));

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "success");
    const detail = await (await request.get(`${API_URL}/executions/${done.id}`, { headers })).json();

    expect(detail.outputPayload).toEqual({ result: true });
    const ifStep = detail.steps.find((s: { nodeId: string }) => s.nodeId === "n2");
    expect(ifStep.output).toEqual({ result: true });
  });

  test("termo de busca (nao numerico) nao bate com ^\\d+$ — branch false", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "If Matches Busca");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, ifGraph("tv 42", "matches", "^\\d+$"));

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "success");
    const detail = await (await request.get(`${API_URL}/executions/${done.id}`, { headers })).json();

    expect(detail.outputPayload).toEqual({ result: false });
  });

  test("padrao de regex invalido falha com erro claro, nao um crash cru", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "If Matches Regex Invalido");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, ifGraph("30342", "matches", "(["));

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "failed");
    expect(done.error).toContain("regex");
  });
});
