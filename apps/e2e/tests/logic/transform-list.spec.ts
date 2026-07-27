import { test, expect } from "../../helpers/fixtures";
import { API_URL, buildTestUser, registerViaApi } from "../../helpers/auth";
import { fetchWorkspaceId, workspaceHeaders } from "../../helpers/settings";
import {
  createWorkflowViaApi,
  saveGraphViaApi,
  runWorkflowViaApi,
  waitForExecutionStatus,
  transformListGraph,
} from "../../helpers/workflows";

/**
 * `logic.transformList` — limita quantos itens de uma lista seguem adiante
 * e/ou reduz cada item a so os campos escolhidos. Motivacao real: a resposta
 * de busca de produto de um ERP (ver docs/integracoes/rein.md) manda o JSON
 * inteiro, aninhado, de cada item — sem este node, tudo isso ia parar no
 * prompt de um agente de IA so pra formatar 5 resultados pro visitante.
 */

const ECHO_URL = `${API_URL}/debug/echo`;

function produto(i: number) {
  return {
    Produto: { Sku: `SKU-${i}`, ProdutoMargem: { Preco: i * 10 } },
    // Campos que um ERP real manda mas o visitante nunca precisa ver —
    // simula o "corpo grande" que motivou o node.
    CamposIrrelevantes: { auditoria: `linha-${i}`, historico: Array(20).fill(`ruido-${i}`) },
  };
}

test.describe("Node Transformar lista (logic.transformList)", () => {
  test("limita a N itens e reduz cada um aos campos escolhidos — total reflete a lista inteira", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Transformar Lista");

    const items = Array.from({ length: 37 }, (_, i) => produto(i));
    await saveGraphViaApi(
      request,
      tokens,
      workspaceId,
      workflow.id,
      transformListGraph({
        echoUrl: ECHO_URL,
        items,
        limit: 2,
        fields: [
          { as: "sku", path: "Produto.Sku" },
          { as: "preco", path: "Produto.ProdutoMargem.Preco" },
        ],
      }),
    );

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "success");
    const detail = await (
      await request.get(`${API_URL}/executions/${done.id}`, { headers })
    ).json();

    expect(detail.outputPayload).toEqual({
      items: [
        { sku: "SKU-0", preco: 0 },
        { sku: "SKU-1", preco: 10 },
      ],
      total: 37,
      shown: 2,
    });
  });

  test("fields vazio mantem o item inteiro — so limita a quantidade", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Transformar Lista Sem Campos");

    const items = [{ a: 1 }, { a: 2 }, { a: 3 }];
    await saveGraphViaApi(
      request,
      tokens,
      workspaceId,
      workflow.id,
      transformListGraph({ echoUrl: ECHO_URL, items, limit: 0, fields: [] }),
    );

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "success");
    const detail = await (
      await request.get(`${API_URL}/executions/${done.id}`, { headers })
    ).json();

    expect(detail.outputPayload).toEqual({ items, total: 3, shown: 3 });
  });

  test("origem que nao resolve pra lista falha com erro claro (nao devolve items vazio em silencio)", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Transformar Lista Origem Errada");

    // n2 (http, GET no /debug/echo) devolve um objeto, nao um array — n3
    // aponta pro node inteiro (`$node.n2.body`) de proposito, pra provar que
    // o node falha explicitamente em vez de seguir adiante com `items: []`.
    const graph = {
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
          type: "api.httpRequest",
          category: "api",
          label: "HTTP Request",
          position: { x: 320, y: 0 },
          config: { method: "GET", url: ECHO_URL, headers: {}, timeoutMs: 5000 },
        },
        {
          id: "n3",
          type: "logic.transformList",
          category: "logic",
          label: "Transformar lista",
          position: { x: 640, y: 0 },
          config: { source: "{{ $node.n2.body }}", limit: 0, fields: [] },
        },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    };

    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, graph);

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "failed");
    expect(done.error).toContain("Origem");
  });
});
