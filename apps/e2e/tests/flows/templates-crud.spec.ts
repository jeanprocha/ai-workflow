import { test, expect } from "../../helpers/fixtures";
import {
  API_URL,
  buildTestUser,
  registerViaApi,
  buildStorageState,
  authenticateContext,
} from "../../helpers/auth";
import { fetchWorkspaceId, workspaceHeaders } from "../../helpers/settings";
import { createWorkflowViaApi, saveGraphViaApi } from "../../helpers/workflows";

/**
 * H2-02 — CRUD de templates por workspace. O `templates.spec.ts` original
 * (catalogo global, `use()`) nao e tocado aqui; este arquivo cobre so o que
 * e novo: criar/editar/excluir template do workspace, a sanitizacao do
 * grafo salvo, e o isolamento entre workspaces (inclusive no `use()`, que
 * ganhou escopo no commit 1 deste tema).
 */

/**
 * trigger.webhook -> api.httpRequest, com credential/headers/query/webhookId
 * — cobre toda a sanitizacao num grafo so. `webhookId: ""` e preenchido pelo
 * `ensureWebhookId` do saveGraph; o template criado a partir desta versao
 * precisa perde-lo (capability do fluxo de origem).
 */
function sensitiveGraph() {
  return {
    nodes: [
      {
        id: "n1",
        type: "trigger.webhook",
        category: "trigger",
        label: "Webhook",
        position: { x: 0, y: 0 },
        config: { webhookId: "" },
      },
      {
        id: "n2",
        type: "api.httpRequest",
        category: "api",
        label: "HTTP Request",
        position: { x: 320, y: 0 },
        config: {
          method: "GET",
          url: "https://erp.example/webhook?token=embutido",
          headers: { Authorization: "Bearer segredo", "X-Trace": "1" },
          query: { api_key: "s", foo: "bar" },
          timeoutMs: 3000,
          credential: "conn-privada",
        },
      },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2" }],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

test.describe("Templates CRUD via API", () => {
  test("@smoke criar a partir de um fluxo sanitiza o grafo salvo (visivel via GET)", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo Origem");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, sensitiveGraph());

    const createResponse = await request.post(`${API_URL}/templates`, {
      headers,
      data: { name: "Meu Template E2E", category: "Vendas", workflowId: workflow.id },
    });
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();
    expect(created.workspaceId).toBe(workspaceId);

    const list = await request.get(`${API_URL}/templates`, { headers });
    const templates = (await list.json()) as Array<{
      id: string;
      workspaceId: string | null;
      graph: { nodes: Array<{ id: string; type: string; config: Record<string, unknown> }> };
    }>;
    // contrato do templates.spec.ts original: seed continua primeiro.
    expect(templates[0].workspaceId).toBeNull();
    expect(templates[0].graph.nodes.length).toBeGreaterThan(0);

    const saved = templates.find((t) => t.id === created.id)!;
    const webhookNode = saved.graph.nodes.find((n) => n.type === "trigger.webhook")!;
    expect(webhookNode.config.webhookId).toBeUndefined(); // removido, nao vazio

    const httpNode = saved.graph.nodes.find((n) => n.type === "api.httpRequest")!;
    expect(httpNode.config.credential).toBe("conn-privada"); // politica: keep
    expect(httpNode.config.url).toBe("https://erp.example/webhook?token=embutido"); // limitacao documentada
    const httpHeaders = httpNode.config.headers as Record<string, string>;
    expect(httpHeaders.Authorization).toBe("");
    expect(httpHeaders["X-Trace"]).toBe("1"); // politica sensitive-keys: preservado
    const httpQuery = httpNode.config.query as Record<string, string>;
    expect(httpQuery.api_key).toBe("");
    expect(httpQuery.foo).toBe("bar");
  });

  test("PATCH altera so metadados; grafo permanece intacto", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo B");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, sensitiveGraph());
    const created = await (
      await request.post(`${API_URL}/templates`, {
        headers,
        data: { name: "Template Original", category: "Vendas", workflowId: workflow.id },
      })
    ).json();

    const patchResponse = await request.patch(`${API_URL}/templates/${created.id}`, {
      headers,
      data: { name: "Template Renomeado", category: "Financeiro" },
    });
    expect(patchResponse.ok()).toBe(true);

    const list = await request.get(`${API_URL}/templates`, { headers });
    const updated = ((await list.json()) as Array<{
      id: string;
      name: string;
      category: string;
      graph: { nodes: unknown[] };
    }>).find((t) => t.id === created.id)!;
    expect(updated.name).toBe("Template Renomeado");
    expect(updated.category).toBe("Financeiro");
    expect(updated.graph.nodes).toHaveLength(created.graph.nodes.length);
  });

  test("PATCH/DELETE num template global (seed) -> 404", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const templates = (await (
      await request.get(`${API_URL}/templates`, { headers })
    ).json()) as Array<{ id: string; workspaceId: string | null }>;
    const seed = templates.find((t) => t.workspaceId === null)!;

    const patchResponse = await request.patch(`${API_URL}/templates/${seed.id}`, {
      headers,
      data: { name: "Nao deveria funcionar" },
    });
    expect(patchResponse.status()).toBe(404);
    expect((await patchResponse.json()).message).toBe("Template nao encontrado.");

    const deleteResponse = await request.delete(`${API_URL}/templates/${seed.id}`, { headers });
    expect(deleteResponse.status()).toBe(404);
  });

  test("DELETE remove o proprio template; seeds continuam", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo C");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, sensitiveGraph());
    const created = await (
      await request.post(`${API_URL}/templates`, {
        headers,
        data: { name: "Vai Ser Excluido", category: "Vendas", workflowId: workflow.id },
      })
    ).json();

    const seedCountBefore = ((await (
      await request.get(`${API_URL}/templates`, { headers })
    ).json()) as Array<{ workspaceId: string | null }>).filter((t) => t.workspaceId === null).length;

    const deleteResponse = await request.delete(`${API_URL}/templates/${created.id}`, { headers });
    expect(deleteResponse.ok()).toBe(true);

    const after = (await (
      await request.get(`${API_URL}/templates`, { headers })
    ).json()) as Array<{ id: string; workspaceId: string | null }>;
    expect(after.some((t) => t.id === created.id)).toBe(false);
    expect(after.filter((t) => t.workspaceId === null)).toHaveLength(seedCountBefore);
  });

  test("nome duplicado no workspace -> 409", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo D");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, sensitiveGraph());
    const data = { name: "Nome Repetido", category: "Vendas", workflowId: workflow.id };

    const first = await request.post(`${API_URL}/templates`, { headers, data });
    expect(first.ok()).toBe(true);

    const second = await request.post(`${API_URL}/templates`, { headers, data });
    expect(second.status()).toBe(409);
    expect((await second.json()).message).toBe(
      "Ja existe um template com este nome neste workspace.",
    );
  });

  test("usar o template criado gera fluxo draft", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo E");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, sensitiveGraph());
    const created = await (
      await request.post(`${API_URL}/templates`, {
        headers,
        data: { name: "Template Usavel", category: "Vendas", workflowId: workflow.id },
      })
    ).json();

    const useResponse = await request.post(`${API_URL}/templates/${created.id}/use`, { headers });
    expect(useResponse.status()).toBe(201);
    const cloned = await useResponse.json();
    expect(cloned.status).toBe("draft");
  });

  test.describe("isolamento entre workspaces", () => {
    test("B nao ve o template de A, e toma 404 em PATCH/DELETE/use no proprio workspace e 403 no alheio", async ({
      request,
    }) => {
      const tokensA = await registerViaApi(request, buildTestUser());
      const workspaceA = await fetchWorkspaceId(request, tokensA);
      const headersA = workspaceHeaders(tokensA, workspaceA);

      const workflow = await createWorkflowViaApi(request, tokensA, workspaceA, "Fluxo de A");
      await saveGraphViaApi(request, tokensA, workspaceA, workflow.id, sensitiveGraph());
      const created = await (
        await request.post(`${API_URL}/templates`, {
          headers: headersA,
          data: { name: "Template de A", category: "Vendas", workflowId: workflow.id },
        })
      ).json();

      const tokensB = await registerViaApi(request, buildTestUser());
      const workspaceB = await fetchWorkspaceId(request, tokensB);
      const headersB = workspaceHeaders(tokensB, workspaceB);

      const listB = (await (
        await request.get(`${API_URL}/templates`, { headers: headersB })
      ).json()) as Array<{ id: string }>;
      expect(listB.some((t) => t.id === created.id)).toBe(false);

      const patchNotFound = await request.patch(`${API_URL}/templates/${created.id}`, {
        headers: headersB,
        data: { name: "Roubado" },
      });
      expect(patchNotFound.status()).toBe(404);

      const deleteNotFound = await request.delete(`${API_URL}/templates/${created.id}`, {
        headers: headersB,
      });
      expect(deleteNotFound.status()).toBe(404);

      const useNotFound = await request.post(`${API_URL}/templates/${created.id}/use`, {
        headers: headersB,
      });
      expect(useNotFound.status()).toBe(404);

      // B se passando por membro do workspace de A: guard barra antes de
      // qualquer query de template.
      const forbidden = await request.delete(`${API_URL}/templates/${created.id}`, {
        headers: workspaceHeaders(tokensB, workspaceA),
      });
      expect(forbidden.status()).toBe(403);
      expect((await forbidden.json()).message).toBe(
        "Voce nao tem acesso a este workspace.",
      );
    });
  });
});

test.describe("Templates CRUD via UI", () => {
  test("busca filtra pro card do workspace, com badge e menu proprios; excluir remove o card", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo UI");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, sensitiveGraph());
    await request.post(`${API_URL}/templates`, {
      headers: workspaceHeaders(tokens, workspaceId),
      data: { name: "Template Visivel na UI", category: "Vendas", workflowId: workflow.id },
    });

    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/templates");

    await page.getByPlaceholder("Buscar templates...").fill("Template Visivel na UI");
    await expect(page.getByText("Meu workspace")).toBeVisible();
    await expect(page.getByRole("button", { name: "Usar template" })).toBeVisible();

    await page.getByLabel("Ações do template Template Visivel na UI").click();
    await page.getByRole("menuitem", { name: "Excluir" }).click();
    await page.getByRole("button", { name: "Excluir" }).click();

    await expect(page.getByText("Template excluído.")).toBeVisible();
    await expect(page.getByText("Template Visivel na UI")).not.toBeVisible();
  });
});
