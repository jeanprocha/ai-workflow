import { test, expect } from "../../helpers/fixtures";
import {
  API_URL,
  buildTestUser,
  registerViaApi,
  buildStorageState,
  authenticateContext,
} from "../../helpers/auth";
import { fetchWorkspaceId, workspaceHeaders } from "../../helpers/settings";

/**
 * Fase 03 — criacao por template (terceiro caminho de criacao de fluxo;
 * mora em /templates, nao em /flows). Templates sao um catalogo GLOBAL
 * seedado (sem workspace_id na tabela — ver ADR-006), mas as rotas
 * exigem x-workspace-id como qualquer outra rota de negocio (C5).
 */

test.describe("Templates (via UI)", () => {
  test("usar template cria fluxo e navega direto pro editor @smoke", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/templates");

    // Catalogo seedado — pelo menos um card com botao de usar.
    const useButtons = page.getByRole("button", { name: "Usar template" });
    await expect(useButtons.first()).toBeVisible();

    await useButtons.first().click();

    await expect(page.getByText(/criado a partir do template\./)).toBeVisible();
    // Navega pro editor do fluxo recem-criado.
    await expect(page).toHaveURL(/\/flows\/[0-9a-f-]{36}$/);
  });
});

test.describe("Templates via API", () => {
  test("GET /templates sem x-workspace-id -> 400", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());

    const response = await request.get(`${API_URL}/templates`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).message).toBe(
      "Header x-workspace-id e obrigatorio.",
    );
  });

  test("GET /templates lista o catalogo global", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);

    const response = await request.get(`${API_URL}/templates`, {
      headers: workspaceHeaders(tokens, workspaceId),
    });
    expect(response.ok()).toBe(true);
    const templates = (await response.json()) as Array<{
      id: string;
      name: string;
      graph: { nodes: unknown[] };
    }>;
    expect(templates.length).toBeGreaterThan(0);
    // Todo template seedado vem com grafo completo (usado no preview da UI).
    expect(templates[0].graph.nodes.length).toBeGreaterThan(0);
  });

  test("POST /templates/:id/use cria fluxo draft com o grafo do template", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const templates = (await (
      await request.get(`${API_URL}/templates`, { headers })
    ).json()) as Array<{ id: string; name: string; graph: { nodes: unknown[] } }>;
    const template = templates[0];

    const response = await request.post(
      `${API_URL}/templates/${template.id}/use`,
      { headers },
    );
    expect(response.status()).toBe(201);
    const workflow = await response.json();
    expect(workflow.name).toBe(template.name);
    expect(workflow.status).toBe("draft");
    expect(workflow.currentVersion.versionNumber).toBe(1);
    expect(workflow.currentVersion.graph.nodes).toHaveLength(
      template.graph.nodes.length,
    );

    // O fluxo criado aparece na lista do workspace.
    const list = await request.get(`${API_URL}/workflows`, { headers });
    const names = ((await list.json()) as Array<{ name: string }>).map(
      (w) => w.name,
    );
    expect(names).toContain(template.name);
  });

  test("POST /templates/:id/use com id inexistente -> 404", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);

    const response = await request.post(
      `${API_URL}/templates/nao-existe-este-template/use`,
      { headers: workspaceHeaders(tokens, workspaceId) },
    );
    expect(response.status()).toBe(404);
    expect((await response.json()).message).toBe("Template nao encontrado.");
  });
});
