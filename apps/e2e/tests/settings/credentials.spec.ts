import { test, expect } from "../../helpers/fixtures";
import type { Page } from "@playwright/test";
import {
  API_URL,
  buildTestUser,
  registerViaApi,
  buildStorageState,
  authenticateContext,
} from "../../helpers/auth";
import {
  createCredentialViaApi,
  fetchWorkspaceId,
  workspaceHeaders,
} from "../../helpers/settings";

/**
 * Fase 02 — Conexoes (credenciais).
 *
 * Armadilhas de locator mapeadas na discovery desta fase:
 * - Os dialogs (base-ui) montam em portal FORA da <section> — sempre buscar
 *   via page.getByRole("dialog"), nunca escopado na section.
 * - O titulo do dialog e identico ao texto do botao que o abre ("Adicionar
 *   conexao") — usar getByRole("heading") dentro do dialog evita violacao de
 *   strict mode enquanto ele esta aberto.
 * - Submit com campo vazio e um no-op silencioso (guard client-side, sem
 *   toast nem erro inline) — a unica assercao possivel e o dialog continuar
 *   aberto.
 */

async function fillCredentialDialog(
  page: Page,
  data: { provider: string; name: string; value: string },
) {
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Provider").fill(data.provider);
  await dialog.getByLabel("Nome").fill(data.name);
  await dialog.getByLabel("Chave / valor").fill(data.value);
}

test.describe("Conexoes (via UI)", () => {
  test("empty state -> criar conexao -> row mascarada, sem vazar o valor", async ({
    page,
    context,
    request,
  }) => {
    const user = buildTestUser();
    const tokens = await registerViaApi(request, user);
    const storageState = await buildStorageState(request, tokens);
    await authenticateContext(context, storageState);
    await page.goto("/settings");

    await expect(
      page.getByRole("heading", { name: "Nenhuma conexao ainda" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Adicionar conexao" }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Adicionar conexao" }),
    ).toBeVisible();

    const secretValue = "sk-super-secreto-98765432";
    await fillCredentialDialog(page, {
      provider: "openai",
      name: "OpenAI Producao",
      value: secretValue,
    });
    await dialog.getByRole("button", { name: "Adicionar", exact: true }).click();

    await expect(page.getByText("Conexao adicionada.")).toBeVisible();
    await expect(page.getByText("OpenAI Producao")).toBeVisible();
    // Mascara: provider · ••••<ultimos 4 do valor real>.
    await expect(page.getByText("openai · ••••5432")).toBeVisible();
    // O valor completo nunca pode aparecer no DOM — nem em atributo escondido.
    expect(await page.content()).not.toContain(secretValue);
  });

  test("campo de valor e type=password (nao exibe o que se digita)", async ({
    page,
    context,
    request,
  }) => {
    const user = buildTestUser();
    const tokens = await registerViaApi(request, user);
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/settings");

    await page.getByRole("button", { name: "Adicionar conexao" }).click();
    await expect(
      page.getByRole("dialog").getByLabel("Chave / valor"),
    ).toHaveAttribute("type", "password");
  });

  test("submit com campos vazios e no-op: dialog permanece aberto", async ({
    page,
    context,
    request,
  }) => {
    const user = buildTestUser();
    const tokens = await registerViaApi(request, user);
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/settings");

    await page.getByRole("button", { name: "Adicionar conexao" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Adicionar", exact: true }).click();

    // Guard client-side silencioso: sem toast, sem erro — o dialog so fica aberto.
    await expect(dialog).toBeVisible();
    await expect(page.getByText("Conexao adicionada.")).not.toBeVisible();
  });

  test("Cancelar fecha o dialog sem criar nada", async ({
    page,
    context,
    request,
  }) => {
    const user = buildTestUser();
    const tokens = await registerViaApi(request, user);
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/settings");

    await page.getByRole("button", { name: "Adicionar conexao" }).click();
    const dialog = page.getByRole("dialog");
    await fillCredentialDialog(page, {
      provider: "stripe",
      name: "Nao Deve Existir",
      value: "sk-descartado",
    });
    await dialog.getByRole("button", { name: "Cancelar" }).click();

    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Nenhuma conexao ainda" }),
    ).toBeVisible();
  });

  test("deletar: confirmacao cancela e depois remove de verdade", async ({
    page,
    context,
    request,
  }) => {
    const user = buildTestUser();
    const tokens = await registerViaApi(request, user);
    const workspaceId = await fetchWorkspaceId(request, tokens);
    await createCredentialViaApi(request, tokens, workspaceId, {
      provider: "anthropic",
      name: "Chave Descartavel",
      value: "sk-ant-11112222",
    });
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/settings");

    // aria-label do botao de lixeira = "Remover conexao <nome>" (fix A2 desta fase).
    await page.getByLabel("Remover conexao Chave Descartavel").click();
    const alert = page.getByRole("alertdialog");
    await expect(
      alert.getByRole("heading", { name: "Remover esta conexao?" }),
    ).toBeVisible();

    await alert.getByRole("button", { name: "Cancelar" }).click();
    await expect(alert).not.toBeVisible();
    await expect(page.getByText("Chave Descartavel")).toBeVisible();

    await page.getByLabel("Remover conexao Chave Descartavel").click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Remover" })
      .click();

    await expect(page.getByText("Conexao removida.")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Nenhuma conexao ainda" }),
    ).toBeVisible();
  });

  test("nome duplicado mostra o erro do servidor no toast", async ({
    page,
    context,
    request,
  }) => {
    const user = buildTestUser();
    const tokens = await registerViaApi(request, user);
    const workspaceId = await fetchWorkspaceId(request, tokens);
    await createCredentialViaApi(request, tokens, workspaceId, {
      provider: "openai",
      name: "Chave Unica",
      value: "sk-original-1234",
    });
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/settings");

    await page.getByRole("button", { name: "Adicionar conexao" }).click();
    const dialog = page.getByRole("dialog");
    await fillCredentialDialog(page, {
      provider: "openai",
      name: "Chave Unica",
      value: "sk-duplicada-9999",
    });
    await dialog.getByRole("button", { name: "Adicionar", exact: true }).click();

    await expect(
      page.getByText("Ja existe uma conexao com este nome neste workspace."),
    ).toBeVisible();
  });
});

test.describe("Conexoes via API", () => {
  test("POST /credentials cria e retorna so metadados (lastFour, nunca o valor)", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);

    const response = await request.post(`${API_URL}/credentials`, {
      headers: workspaceHeaders(tokens, workspaceId),
      data: { provider: "openai", name: "api-key", value: "sk-teste-abcd1234" },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      provider: "openai",
      name: "api-key",
      lastFour: "1234",
    });
    expect(body.id).toBeTruthy();
    // O valor e o ciphertext jamais saem pela API.
    expect(body).not.toHaveProperty("value");
    expect(body).not.toHaveProperty("encryptedData");
  });

  test("GET /credentials lista sem vazar valor, mais recente primeiro", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    await request.post(`${API_URL}/credentials`, {
      headers,
      data: { provider: "openai", name: "primeira", value: "sk-aaaa0001" },
    });
    await request.post(`${API_URL}/credentials`, {
      headers,
      data: { provider: "anthropic", name: "segunda", value: "sk-bbbb0002" },
    });

    const response = await request.get(`${API_URL}/credentials`, { headers });
    expect(response.ok()).toBe(true);
    const list = await response.json();
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe("segunda");
    expect(list[1].name).toBe("primeira");
    for (const item of list) {
      expect(item).not.toHaveProperty("value");
      expect(item).not.toHaveProperty("encryptedData");
    }
  });

  test.describe("validacao de campos", () => {
    test("campos ausentes -> 400", async ({ request }) => {
      const tokens = await registerViaApi(request, buildTestUser());
      const workspaceId = await fetchWorkspaceId(request, tokens);

      const response = await request.post(`${API_URL}/credentials`, {
        headers: workspaceHeaders(tokens, workspaceId),
        data: { provider: "openai" },
      });
      expect(response.status()).toBe(400);
    });

    test("valor vazio -> 400 (MinLength 1)", async ({ request }) => {
      const tokens = await registerViaApi(request, buildTestUser());
      const workspaceId = await fetchWorkspaceId(request, tokens);

      const response = await request.post(`${API_URL}/credentials`, {
        headers: workspaceHeaders(tokens, workspaceId),
        data: { provider: "openai", name: "chave", value: "" },
      });
      expect(response.status()).toBe(400);
    });
  });

  test("POST duplicado -> 409 em pt e traduzido com x-lang: en", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const data = { provider: "openai", name: "repetida", value: "sk-xyz98765" };

    await request.post(`${API_URL}/credentials`, { headers, data });

    const duplicate = await request.post(`${API_URL}/credentials`, {
      headers,
      data,
    });
    expect(duplicate.status()).toBe(409);
    expect((await duplicate.json()).message).toBe(
      "Ja existe uma conexao com este nome neste workspace.",
    );

    const duplicateEn = await request.post(`${API_URL}/credentials`, {
      headers: { ...headers, "x-lang": "en" },
      data,
    });
    expect(duplicateEn.status()).toBe(409);
    expect((await duplicateEn.json()).message).toBe(
      "A connection with this name already exists in this workspace.",
    );
  });

  test("DELETE id inexistente -> 404", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);

    const response = await request.delete(
      `${API_URL}/credentials/00000000-0000-0000-0000-000000000000`,
      { headers: workspaceHeaders(tokens, workspaceId) },
    );
    expect(response.status()).toBe(404);
    expect((await response.json()).message).toBe("Conexao nao encontrada.");
  });

  test.describe("isolamento entre workspaces", () => {
    test("usuario B nao acessa credencial de A: 404 no proprio workspace, 403 no alheio", async ({
      request,
    }) => {
      const tokensA = await registerViaApi(request, buildTestUser());
      const workspaceA = await fetchWorkspaceId(request, tokensA);
      const credential = await createCredentialViaApi(
        request,
        tokensA,
        workspaceA,
        { provider: "openai", name: "so-do-a", value: "sk-privada-0001" },
      );

      const tokensB = await registerViaApi(request, buildTestUser());
      const workspaceB = await fetchWorkspaceId(request, tokensB);

      // B usando o proprio workspace: o findFirst por (id, workspaceId) nao
      // acha a credencial de A -> 404 sem revelar que o id existe.
      const notFound = await request.delete(
        `${API_URL}/credentials/${credential.id}`,
        { headers: workspaceHeaders(tokensB, workspaceB) },
      );
      expect(notFound.status()).toBe(404);

      // B tentando se passar por membro do workspace de A: guard barra antes
      // de qualquer query de credencial.
      const forbidden = await request.delete(
        `${API_URL}/credentials/${credential.id}`,
        { headers: workspaceHeaders(tokensB, workspaceA) },
      );
      expect(forbidden.status()).toBe(403);
      expect((await forbidden.json()).message).toBe(
        "Voce nao tem acesso a este workspace.",
      );
    });

    test("sem x-workspace-id -> 400; sem JWT -> 401", async ({ request }) => {
      const tokens = await registerViaApi(request, buildTestUser());

      const noWorkspace = await request.get(`${API_URL}/credentials`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      expect(noWorkspace.status()).toBe(400);
      expect((await noWorkspace.json()).message).toBe(
        "Header x-workspace-id e obrigatorio.",
      );

      const noAuth = await request.get(`${API_URL}/credentials`);
      expect(noAuth.status()).toBe(401);
    });
  });
});
