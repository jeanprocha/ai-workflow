import { test, expect } from "../../helpers/fixtures";
import { API_URL, buildTestUser, registerViaApi } from "../../helpers/auth";
import { fetchWorkspaceId, workspaceHeaders } from "../../helpers/settings";
import { createWorkflowViaApi, saveGraphViaApi, runWorkflowViaApi, waitForExecutionStatus } from "../../helpers/workflows";

/**
 * `logic.appendToList` — acrescenta um item ao final de uma lista existente.
 * Motivacao real: montar um carrinho ao longo de varias mensagens de uma
 * conversa (ver "vamos finalizar o fluxo") — $vars so sabe SOBRESCREVER um
 * valor (Set Variables), nao existe "empurra pro array" em expressao
 * nenhuma, entao falta essa peca pra guardar item 1, depois item 2, etc.
 */

function appendGraph(source: unknown, item: unknown) {
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
        type: "logic.appendToList",
        category: "logic",
        label: "Adicionar à lista",
        position: { x: 320, y: 0 },
        config: { source, item },
      },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2" }],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

test.describe("Node Adicionar à lista (logic.appendToList)", () => {
  test("carrinho ainda nao existe (source vazio/ausente): comeca de lista vazia, nao falha", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "AppendToList Primeiro Item");
    // Config legitima do primeiro turno de uma conversa: {{ $vars.carrinho }}
    // ainda nao foi setado, resolve pra undefined — nao e um engano.
    await saveGraphViaApi(
      request,
      tokens,
      workspaceId,
      workflow.id,
      appendGraph(undefined, { id: "30342", quantidade: 2 }),
    );

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "success");
    const detail = await (await request.get(`${API_URL}/executions/${done.id}`, { headers })).json();

    expect(detail.outputPayload).toEqual({
      items: [{ id: "30342", quantidade: 2 }],
      total: 1,
    });
  });

  test("carrinho com itens: acrescenta no final, preservando os anteriores", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "AppendToList Item Seguinte");
    const carrinhoAtual = [{ id: "30342", quantidade: 2 }];
    await saveGraphViaApi(
      request,
      tokens,
      workspaceId,
      workflow.id,
      appendGraph(carrinhoAtual, { id: "30291", quantidade: 1 }),
    );

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "success");
    const detail = await (await request.get(`${API_URL}/executions/${done.id}`, { headers })).json();

    expect(detail.outputPayload).toEqual({
      items: [
        { id: "30342", quantidade: 2 },
        { id: "30291", quantidade: 1 },
      ],
      total: 2,
    });
  });
});
