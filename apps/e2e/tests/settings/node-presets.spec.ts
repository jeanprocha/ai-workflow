import { test, expect } from "../../helpers/fixtures";
import {
  API_URL,
  buildTestUser,
  registerViaApi,
  buildStorageState,
  authenticateContext,
} from "../../helpers/auth";
import { fetchWorkspaceId, workspaceHeaders, createCredentialViaApi } from "../../helpers/settings";
import { createWorkflowViaApi, saveGraphViaApi } from "../../helpers/workflows";

/**
 * Predefinicoes de node (NodePreset) — CRUD via API (molde de variables/
 * credentials) e os dois pontos de uso na UI: PresetBar no painel do editor
 * (aplicar num node, salvar a partir de outro) e a secao em Configuracoes.
 */

test.describe("Predefinicoes de node (API)", () => {
  test("cria, lista filtrado por nodeType, duplicado -> 409, atualiza, remove", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const create = await request.post(`${API_URL}/node-presets`, {
      headers,
      data: {
        nodeType: "api.httpRequest",
        name: "Rein - Buscar produto",
        description: "Busca no catalogo Rein",
        config: { method: "GET", credential: "rein" },
      },
    });
    expect(create.status()).toBe(201);
    const created = await create.json();
    expect(created).toMatchObject({ nodeType: "api.httpRequest", name: "Rein - Buscar produto" });

    const list = await request.get(`${API_URL}/node-presets?nodeType=api.httpRequest`, { headers });
    const items = await list.json();
    expect(items.map((p: { id: string }) => p.id)).toContain(created.id);

    const duplicate = await request.post(`${API_URL}/node-presets`, {
      headers,
      data: { nodeType: "api.httpRequest", name: "Rein - Buscar produto", config: {} },
    });
    expect(duplicate.status()).toBe(409);

    const update = await request.patch(`${API_URL}/node-presets/${created.id}`, {
      headers,
      data: { description: "atualizada" },
    });
    expect((await update.json()).description).toBe("atualizada");

    const remove = await request.delete(`${API_URL}/node-presets/${created.id}`, { headers });
    expect(remove.status()).toBe(200);

    const afterDelete = await request.get(`${API_URL}/node-presets?nodeType=api.httpRequest`, { headers });
    expect((await afterDelete.json()).map((p: { id: string }) => p.id)).not.toContain(created.id);
  });

  test("isolamento entre workspaces: usuario B nao ve nem remove predefinicao de A", async ({ request }) => {
    const tokensA = await registerViaApi(request, buildTestUser());
    const workspaceA = await fetchWorkspaceId(request, tokensA);
    const created = await (
      await request.post(`${API_URL}/node-presets`, {
        headers: workspaceHeaders(tokensA, workspaceA),
        data: { nodeType: "api.httpRequest", name: "Preset De A", config: {} },
      })
    ).json();

    const tokensB = await registerViaApi(request, buildTestUser());
    const workspaceB = await fetchWorkspaceId(request, tokensB);
    const headersB = workspaceHeaders(tokensB, workspaceB);

    const listB = await request.get(`${API_URL}/node-presets`, { headers: headersB });
    expect((await listB.json()).map((p: { id: string }) => p.id)).not.toContain(created.id);

    const removeForeign = await request.delete(`${API_URL}/node-presets/${created.id}`, {
      headers: headersB,
    });
    expect(removeForeign.status()).toBe(404);
  });
});

test.describe("Predefinicoes de node (UI)", () => {
  test("PresetBar: salvar a partir de um node e aplicar em outro node do mesmo tipo", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "PresetBar UI");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, {
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
          config: { method: "GET", url: "https://api.exemplo.com", headers: {}, timeoutMs: 10000 },
        },
        {
          id: "n3",
          type: "api.httpRequest",
          category: "api",
          label: "HTTP Request",
          position: { x: 640, y: 0 },
          config: { method: "GET", url: "https://api.exemplo.com", headers: {}, timeoutMs: 10000 },
        },
      ],
      edges: [{ id: "e1", source: "n1", target: "n2" }],
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    // Conexao selecionada num <select> (CredentialSelect) precisa existir de
    // verdade — ao contrario do <input> de texto livre de antes, nao da pra
    // so digitar um nome que nao existe.
    await createCredentialViaApi(request, tokens, workspaceId, {
      provider: "custom",
      name: "minha-conexao-e2e",
      value: "qualquer-coisa",
    });
    await authenticateContext(context, await buildStorageState(request, tokens));

    await page.goto(`/flows/${workflow.id}`);

    // Edita a Conexao no n2 (dentro de Avancado) e salva como predefinicao —
    // le o config LOCAL do painel, nao precisa salvar o fluxo antes.
    await page.locator('[data-testid="rf__node-n2"]').click();
    const panelN2 = page.locator("aside").last();
    await panelN2.getByText("Avançado").click();
    await panelN2.getByLabel("Conexão").selectOption({ label: "minha-conexao-e2e" });

    await panelN2.getByRole("button", { name: "Salvar como predefinição" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nome").fill("Preset E2E");
    await dialog.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Predefinição salva.")).toBeVisible();

    // Aplica no n3 — node diferente, mesmo tipo, config vazio de credential.
    await page.locator('[data-testid="rf__node-n3"]').click();
    const panelN3 = page.locator("aside").last();
    await panelN3.getByLabel("Aplicar predefinição").selectOption({ label: "Preset E2E" });
    await expect(page.getByText("Predefinição aplicada.")).toBeVisible();
    await panelN3.getByText("Avançado").click();
    await expect(panelN3.getByLabel("Conexão")).toHaveValue("minha-conexao-e2e");
  });

  test("Configuracoes: empty state -> criar -> aparece na lista -> remover", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/settings");

    const section = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Predefinições de node" }) });
    await expect(section.getByText("Nenhuma predefinição ainda")).toBeVisible();

    await section.getByRole("button", { name: "Nova predefinição" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Nova predefinição" })).toBeVisible();
    await dialog.getByLabel("Nome").fill("Preset via Configuracoes");
    await dialog.getByRole("button", { name: "Criar" }).click();

    await expect(page.getByText("Predefinição criada.")).toBeVisible();
    await expect(section.getByText("Preset via Configuracoes")).toBeVisible();

    await section.getByLabel(/Remover predefinição/).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remover" }).click();
    await expect(page.getByText("Predefinição removida.")).toBeVisible();
    await expect(section.getByText("Nenhuma predefinição ainda")).toBeVisible();
  });
});
