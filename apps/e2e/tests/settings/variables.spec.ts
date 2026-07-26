import { test, expect } from "../../helpers/fixtures";
import {
  API_URL,
  buildTestUser,
  registerViaApi,
  buildStorageState,
  authenticateContext,
} from "../../helpers/auth";
import {
  createVariableViaApi,
  fetchWorkspaceId,
  workspaceHeaders,
} from "../../helpers/settings";

/**
 * Fase 02 — Variaveis.
 *
 * ⚠️ Locators: getByLabel("Chave") e getByLabel("Valor") PRECISAM de
 * { exact: true } — sem isso, "Chave" tambem casa com "Chave / valor" (label
 * do dialog de conexao) e "Valor" e substring case-insensitive dela. Os dois
 * dialogs nunca ficam abertos ao mesmo tempo, mas o exact evita depender
 * disso. Dialogs montam em portal — buscar via page.getByRole("dialog").
 */

test.describe("Variaveis (via UI)", () => {
  test("empty state -> criar nao-secret -> valor em texto puro + scope global", async ({
    page,
    context,
    request,
  }) => {
    const user = buildTestUser();
    const tokens = await registerViaApi(request, user);
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/settings");

    await expect(
      page.getByRole("heading", { name: "Nenhuma variável ainda" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Adicionar variável" }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Adicionar variável" }),
    ).toBeVisible();

    await dialog.getByLabel("Chave", { exact: true }).fill("API_BASE_URL");
    await dialog.getByLabel("Valor", { exact: true }).fill("https://api.exemplo.com");
    await dialog.getByRole("button", { name: "Adicionar", exact: true }).click();

    await expect(page.getByText("Variável criada.")).toBeVisible();
    await expect(page.getByText("API_BASE_URL")).toBeVisible();
    // Nao-secret: valor visivel em texto puro, scope default "global" cru.
    await expect(
      page.getByText("https://api.exemplo.com · global"),
    ).toBeVisible();
  });

  test("secret: input vira password ao marcar e valor nunca aparece depois", async ({
    page,
    context,
    request,
  }) => {
    const user = buildTestUser();
    const tokens = await registerViaApi(request, user);
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/settings");

    await page.getByRole("button", { name: "Adicionar variável" }).click();
    const dialog = page.getByRole("dialog");

    const valueInput = dialog.getByLabel("Valor", { exact: true });
    await expect(valueInput).toHaveAttribute("type", "text");

    await dialog
      .getByLabel("Tratar como secret (nunca exibido depois de salvo)")
      .check();
    await expect(valueInput).toHaveAttribute("type", "password");

    const secretValue = "senha-ultra-secreta-000111";
    await dialog.getByLabel("Chave", { exact: true }).fill("TOKEN_SECRETO");
    await valueInput.fill(secretValue);
    await dialog.getByRole("button", { name: "Adicionar", exact: true }).click();

    await expect(page.getByText("Variável criada.")).toBeVisible();
    await expect(page.getByText("TOKEN_SECRETO")).toBeVisible();
    // Secret na lista: exatamente 8 bullets no lugar do valor.
    await expect(page.getByText("•••••••• · global")).toBeVisible();
    expect(await page.content()).not.toContain(secretValue);
  });

  test("chave duplicada mostra o erro do servidor no toast", async ({
    page,
    context,
    request,
  }) => {
    const user = buildTestUser();
    const tokens = await registerViaApi(request, user);
    const workspaceId = await fetchWorkspaceId(request, tokens);
    await createVariableViaApi(request, tokens, workspaceId, {
      key: "CHAVE_REPETIDA",
      value: "primeiro-valor",
    });
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/settings");

    await page.getByRole("button", { name: "Adicionar variável" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Chave", { exact: true }).fill("CHAVE_REPETIDA");
    await dialog.getByLabel("Valor", { exact: true }).fill("segundo-valor");
    await dialog.getByRole("button", { name: "Adicionar", exact: true }).click();

    await expect(
      page.getByText("Ja existe uma variavel com esta chave neste workspace."),
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
    await createVariableViaApi(request, tokens, workspaceId, {
      key: "VAR_DESCARTAVEL",
      value: "tanto-faz",
    });
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/settings");

    // aria-label do botao de lixeira = "Remover variável <chave>" (fix A2 desta fase).
    await page.getByLabel("Remover variável VAR_DESCARTAVEL").click();
    const alert = page.getByRole("alertdialog");
    await expect(
      alert.getByRole("heading", { name: "Remover esta variável?" }),
    ).toBeVisible();

    await alert.getByRole("button", { name: "Cancelar" }).click();
    await expect(alert).not.toBeVisible();
    await expect(page.getByText("VAR_DESCARTAVEL")).toBeVisible();

    await page.getByLabel("Remover variável VAR_DESCARTAVEL").click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Remover" })
      .click();

    await expect(page.getByText("Variável removida.")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Nenhuma variável ainda" }),
    ).toBeVisible();
  });

  test("submit com campos vazios e no-op; Cancelar fecha sem criar", async ({
    page,
    context,
    request,
  }) => {
    const user = buildTestUser();
    const tokens = await registerViaApi(request, user);
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/settings");

    await page.getByRole("button", { name: "Adicionar variável" }).click();
    const dialog = page.getByRole("dialog");

    // Guard client-side silencioso: sem toast, sem erro — o dialog so fica aberto.
    await dialog.getByRole("button", { name: "Adicionar", exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(page.getByText("Variável criada.")).not.toBeVisible();

    await dialog.getByLabel("Chave", { exact: true }).fill("NAO_DEVE_EXISTIR");
    await dialog.getByLabel("Valor", { exact: true }).fill("descartado");
    await dialog.getByRole("button", { name: "Cancelar" }).click();

    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Nenhuma variável ainda" }),
    ).toBeVisible();
  });
});

test.describe("Variaveis via API", () => {
  test("nao-secret volta em texto puro; secret volta como value: null", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const plain = await request.post(`${API_URL}/variables`, {
      headers,
      data: { key: "PUBLICA", value: "visivel" },
    });
    expect(plain.status()).toBe(201);
    expect(await plain.json()).toMatchObject({
      key: "PUBLICA",
      value: "visivel",
      isSecret: false,
      scope: "global",
    });

    const secret = await request.post(`${API_URL}/variables`, {
      headers,
      data: { key: "SECRETA", value: "nunca-mais-visivel", isSecret: true },
    });
    expect(secret.status()).toBe(201);
    // Secret e write-once: o valor NUNCA volta pela API (nem mascarado).
    expect(await secret.json()).toMatchObject({
      key: "SECRETA",
      value: null,
      isSecret: true,
    });

    const list = await request.get(`${API_URL}/variables`, { headers });
    const items = (await list.json()) as Array<{ key: string; value: string | null }>;
    expect(items.find((v) => v.key === "PUBLICA")?.value).toBe("visivel");
    expect(items.find((v) => v.key === "SECRETA")?.value).toBeNull();
  });

  test("chave duplicada -> 409 em pt e traduzido com x-lang: en", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const data = { key: "DUPLICADA", value: "a" };

    await request.post(`${API_URL}/variables`, { headers, data });

    const duplicate = await request.post(`${API_URL}/variables`, {
      headers,
      data,
    });
    expect(duplicate.status()).toBe(409);
    expect((await duplicate.json()).message).toBe(
      "Ja existe uma variavel com esta chave neste workspace.",
    );

    const duplicateEn = await request.post(`${API_URL}/variables`, {
      headers: { ...headers, "x-lang": "en" },
      data,
    });
    expect(duplicateEn.status()).toBe(409);
    expect((await duplicateEn.json()).message).toBe(
      "A variable with this key already exists in this workspace.",
    );
  });

  test.describe("scope", () => {
    test("invalido -> 400; omitido -> global; os 3 validos aceitos", async ({
      request,
    }) => {
      const tokens = await registerViaApi(request, buildTestUser());
      const workspaceId = await fetchWorkspaceId(request, tokens);
      const headers = workspaceHeaders(tokens, workspaceId);

      const invalid = await request.post(`${API_URL}/variables`, {
        headers,
        data: { key: "SCOPE_RUIM", value: "x", scope: "producao" },
      });
      expect(invalid.status()).toBe(400);

      for (const scope of ["global", "environment", "runtime"] as const) {
        const response = await request.post(`${API_URL}/variables`, {
          headers,
          data: { key: `SCOPE_${scope.toUpperCase()}`, value: "x", scope },
        });
        expect(response.status()).toBe(201);
        expect((await response.json()).scope).toBe(scope);
      }
    });
  });

  test("DELETE id inexistente -> 404", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);

    const response = await request.delete(
      `${API_URL}/variables/00000000-0000-0000-0000-000000000000`,
      { headers: workspaceHeaders(tokens, workspaceId) },
    );
    expect(response.status()).toBe(404);
    expect((await response.json()).message).toBe("Variavel nao encontrada.");
  });

  test.describe("isolamento entre workspaces", () => {
    test("usuario B nao acessa variavel de A: 404 no proprio workspace, 403 no alheio", async ({
      request,
    }) => {
      const tokensA = await registerViaApi(request, buildTestUser());
      const workspaceA = await fetchWorkspaceId(request, tokensA);
      const variable = await createVariableViaApi(request, tokensA, workspaceA, {
        key: "SO_DO_A",
        value: "privado",
      });

      const tokensB = await registerViaApi(request, buildTestUser());
      const workspaceB = await fetchWorkspaceId(request, tokensB);

      const notFound = await request.delete(
        `${API_URL}/variables/${variable.id}`,
        { headers: workspaceHeaders(tokensB, workspaceB) },
      );
      expect(notFound.status()).toBe(404);

      const forbidden = await request.delete(
        `${API_URL}/variables/${variable.id}`,
        { headers: workspaceHeaders(tokensB, workspaceA) },
      );
      expect(forbidden.status()).toBe(403);
      expect((await forbidden.json()).message).toBe(
        "Voce nao tem acesso a este workspace.",
      );
    });
  });
});
