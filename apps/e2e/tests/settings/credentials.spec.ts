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
import {
  createWorkflowViaApi,
  saveGraphViaApi,
  runWorkflowViaApi,
  waitForExecutionStatus,
  httpRequestGraph,
} from "../../helpers/workflows";

/**
 * Fase 02 — Conexoes (credenciais).
 *
 * Armadilhas de locator mapeadas na discovery desta fase:
 * - Os dialogs (base-ui) montam em portal FORA da <section> — sempre buscar
 *   via page.getByRole("dialog"), nunca escopado na section.
 * - O titulo do dialog e identico ao texto do botao que o abre ("Adicionar
 *   conexão") — usar getByRole("heading") dentro do dialog evita violacao de
 *   strict mode enquanto ele esta aberto.
 * - Submit fica DESABILITADO enquanto faltar campo obrigatorio (antes era um
 *   no-op silencioso, sem nenhum feedback do que faltava).
 * - "Adicionar" colide com "Adicionar campo" (editor multi-campo) em
 *   getByRole — usar { exact: true }.
 *
 * Uma conexao tem dois formatos (`kind`): "secret" (um valor unico — token,
 * webhook URL, connection string) e "fields" (varios pares chave/valor
 * tipados, guardados como objeto JSON criptografado). O tipo por campo
 * importa: e o que faz {{ $auth.filialId }} chegar como numero 1 e nao "1".
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
      page.getByRole("heading", { name: "Nenhuma conexão ainda" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Adicionar conexão" }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Adicionar conexão" }),
    ).toBeVisible();

    const secretValue = "sk-super-secreto-98765432";
    await fillCredentialDialog(page, {
      provider: "openai",
      name: "OpenAI Producao",
      value: secretValue,
    });
    await dialog.getByRole("button", { name: "Adicionar", exact: true }).click();

    await expect(page.getByText("Conexão adicionada.")).toBeVisible();
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

    await page.getByRole("button", { name: "Adicionar conexão" }).click();
    await expect(
      page.getByRole("dialog").getByLabel("Chave / valor"),
    ).toHaveAttribute("type", "password");
  });

  test("campos obrigatorios vazios deixam o botao desabilitado ate serem preenchidos", async ({
    page,
    context,
    request,
  }) => {
    const user = buildTestUser();
    const tokens = await registerViaApi(request, user);
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/settings");

    await page.getByRole("button", { name: "Adicionar conexão" }).click();
    const dialog = page.getByRole("dialog");
    const submit = dialog.getByRole("button", { name: "Adicionar", exact: true });

    // Antes o submit era um no-op silencioso (sem toast nem erro inline) e o
    // usuario nao tinha como saber o que faltava — agora o proprio botao
    // comunica isso, e so libera quando provider + nome + valor existem.
    await expect(submit).toBeDisabled();

    await dialog.getByLabel("Provider").fill("openai");
    await expect(submit).toBeDisabled();
    await dialog.getByLabel("Nome").fill("Parcial");
    await expect(submit).toBeDisabled();
    await dialog.getByLabel("Chave / valor").fill("sk-agora-vai");
    await expect(submit).toBeEnabled();
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

    await page.getByRole("button", { name: "Adicionar conexão" }).click();
    const dialog = page.getByRole("dialog");
    await fillCredentialDialog(page, {
      provider: "stripe",
      name: "Nao Deve Existir",
      value: "sk-descartado",
    });
    await dialog.getByRole("button", { name: "Cancelar" }).click();

    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Nenhuma conexão ainda" }),
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

    // aria-label do botao de lixeira = "Remover conexão <nome>" (fix A2 desta fase).
    await page.getByLabel("Remover conexão Chave Descartavel").click();
    const alert = page.getByRole("alertdialog");
    await expect(
      alert.getByRole("heading", { name: "Remover esta conexão?" }),
    ).toBeVisible();

    await alert.getByRole("button", { name: "Cancelar" }).click();
    await expect(alert).not.toBeVisible();
    await expect(page.getByText("Chave Descartavel")).toBeVisible();

    await page.getByLabel("Remover conexão Chave Descartavel").click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Remover" })
      .click();

    await expect(page.getByText("Conexão removida.")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Nenhuma conexão ainda" }),
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

    await page.getByRole("button", { name: "Adicionar conexão" }).click();
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

test.describe("Conexoes multi-campo (kind: fields)", () => {
  test("API: cria com tipos, fieldsMeta so traz chave+tipo, lastFour vem null", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const response = await request.post(`${API_URL}/credentials`, {
      headers,
      data: {
        provider: "erp",
        name: "erp-fields",
        kind: "fields",
        fields: [
          { key: "clientId", value: "cid-abc", type: "text" },
          { key: "clientSecret", value: "segredo-xyz", type: "text" },
          { key: "filialId", value: "1", type: "number" },
          { key: "ativo", value: "true", type: "boolean" },
        ],
      },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();

    expect(body).toMatchObject({ kind: "fields", lastFour: null });
    // Chave e tipo sim; valor NUNCA.
    expect(body.fieldsMeta).toEqual([
      { key: "clientId", type: "text" },
      { key: "clientSecret", type: "text" },
      { key: "filialId", type: "number" },
      { key: "ativo", type: "boolean" },
    ]);
    expect(JSON.stringify(body)).not.toContain("segredo-xyz");
    expect(body).not.toHaveProperty("value");
    expect(body).not.toHaveProperty("encryptedData");
  });

  test("API: conexao de valor unico nao regride (lastFour continua os 4 ultimos chars)", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);

    // Corpo no formato historico, SEM `kind` — precisa continuar valido.
    const response = await request.post(`${API_URL}/credentials`, {
      headers: workspaceHeaders(tokens, workspaceId),
      data: { provider: "openai", name: "sem-kind", value: "sk-teste-abcd1234" },
    });
    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject({
      kind: "secret",
      lastFour: "1234",
      fieldsMeta: null,
    });
  });

  test("API: validacoes (zero campos, chave com ponto, chave duplicada, numero invalido, secret sem valor)", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const cases: Array<{ data: Record<string, unknown>; contains: string }> = [
      {
        data: { provider: "x", name: "v1", kind: "fields", fields: [] },
        contains: "pelo menos um campo",
      },
      {
        // Chave com ponto quebraria {{ $auth.<chave> }} — getPath() em
        // packages/nodes/src/expressions.ts corta o caminho pelo ponto.
        data: {
          provider: "x",
          name: "v2",
          kind: "fields",
          fields: [{ key: "a.b", value: "1", type: "text" }],
        },
        contains: "nao pode conter ponto",
      },
      {
        data: {
          provider: "x",
          name: "v3",
          kind: "fields",
          fields: [
            { key: "dup", value: "1", type: "text" },
            { key: "dup", value: "2", type: "text" },
          ],
        },
        contains: "repetido",
      },
      {
        data: {
          provider: "x",
          name: "v4",
          kind: "fields",
          fields: [{ key: "n", value: "abc", type: "number" }],
        },
        contains: "numero valido",
      },
      { data: { provider: "x", name: "v5", kind: "secret" }, contains: "valor" },
    ];

    for (const { data, contains } of cases) {
      const response = await request.post(`${API_URL}/credentials`, { headers, data });
      expect(response.status()).toBe(400);
      expect((await response.json()).message).toContain(contains);
    }
  });

  test("API: PATCH renomeia sem tocar no segredo; PATCH com fields substitui", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const created = await createCredentialViaApi(request, tokens, workspaceId, {
      provider: "erp",
      name: "patch-alvo",
      kind: "fields",
      fields: [{ key: "clientId", value: "cid-1", type: "text" }],
    });

    const renamed = await request.patch(`${API_URL}/credentials/${created.id}`, {
      headers,
      data: { name: "patch-renomeado" },
    });
    expect(renamed.status()).toBe(200);
    const renamedBody = await renamed.json();
    expect(renamedBody.name).toBe("patch-renomeado");
    // Sem value/fields no corpo, os campos continuam os mesmos.
    expect(renamedBody.fieldsMeta).toEqual([{ key: "clientId", type: "text" }]);

    const replaced = await request.patch(`${API_URL}/credentials/${created.id}`, {
      headers,
      data: {
        kind: "fields",
        fields: [
          { key: "clientId", value: "cid-2", type: "text" },
          { key: "filialId", value: "7", type: "number" },
        ],
      },
    });
    expect((await replaced.json()).fieldsMeta).toEqual([
      { key: "clientId", type: "text" },
      { key: "filialId", type: "number" },
    ]);

    const foreign = await registerViaApi(request, buildTestUser());
    const foreignWorkspace = await fetchWorkspaceId(request, foreign);
    const crossWorkspace = await request.patch(`${API_URL}/credentials/${created.id}`, {
      headers: workspaceHeaders(foreign, foreignWorkspace),
      data: { name: "invadido" },
    });
    expect(crossWorkspace.status()).toBe(404);
  });

  test("o tipo do campo sobrevive ate o corpo da requisicao (numero e numero, nao string)", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    await createCredentialViaApi(request, tokens, workspaceId, {
      provider: "erp",
      name: "erp-tipos",
      kind: "fields",
      fields: [
        { key: "clientId", value: "cid-abc", type: "text" },
        { key: "filialId", value: "1", type: "number" },
        { key: "ativo", value: "true", type: "boolean" },
      ],
    });

    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Coercao De Tipo");
    await saveGraphViaApi(
      request,
      tokens,
      workspaceId,
      workflow.id,
      httpRequestGraph({
        method: "PUT",
        url: `${API_URL}/debug/echo`,
        headers: { "Content-Type": "application/json" },
        query: {},
        body: {
          FilialId: "{{ $auth.filialId }}",
          ClientId: "{{ $auth.clientId }}",
          Ativo: "{{ $auth.ativo }}",
        },
        timeoutMs: 5000,
        credential: "erp-tipos",
        signature: { enabled: false },
      }),
    );

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "success");
    const detail = await (await request.get(`${API_URL}/executions/${done.id}`, { headers })).json();

    // O ponto da feature: uma UI de chave/valor produz so strings, mas o ERP
    // espera numero/booleano. Sem a coercao por tipo, FilialId chegaria "1".
    expect(detail.outputPayload.body.body).toEqual({
      FilialId: 1,
      ClientId: "cid-abc",
      Ativo: true,
    });
  });

  test("UI: criar multi-campo, ver os nomes na lista e editar com chaves/tipos preenchidos e valores em branco", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/settings");

    const section = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Conexões" }) });
    await section.getByRole("button", { name: "Adicionar conexão" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Provider").fill("erp");
    await dialog.getByLabel("Nome").fill("erp-ui");
    await dialog.getByLabel("Formato").selectOption("fields");

    const segredo = "valor-super-secreto-98765";
    await dialog.getByRole("button", { name: "Adicionar campo" }).click();
    await dialog.getByPlaceholder("nome do campo").fill("clientSecret");
    await dialog.getByPlaceholder("valor").fill(segredo);

    await dialog.getByRole("button", { name: "Adicionar campo" }).click();
    await dialog.getByPlaceholder("nome do campo").nth(1).fill("filialId");
    await dialog.getByLabel("Tipo do campo filialId").selectOption("number");
    await dialog.getByPlaceholder("valor").nth(1).fill("1");

    await dialog.getByRole("button", { name: "Adicionar", exact: true }).click();
    await expect(page.getByText("Conexão adicionada.")).toBeVisible();

    // Lista mostra os NOMES dos campos (nao sao segredo) — nunca os valores.
    await expect(section.getByText("erp · clientSecret, filialId")).toBeVisible();
    expect(await page.content()).not.toContain(segredo);

    await section.getByLabel("Editar conexão erp-ui").click();
    const editDialog = page.getByRole("dialog");
    await expect(editDialog.getByRole("heading", { name: "Editar conexão" })).toBeVisible();
    // Chave e TIPO voltam preenchidos; o valor salvo nunca volta pro navegador.
    await expect(editDialog.getByPlaceholder("nome do campo").first()).toHaveValue("clientSecret");
    await expect(editDialog.getByLabel("Tipo do campo filialId")).toHaveValue("number");
    await expect(editDialog.getByPlaceholder("valor").first()).toHaveValue("");

    await editDialog.getByLabel("Nome").fill("erp-ui-renomeado");
    await editDialog.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Conexão atualizada.")).toBeVisible();
    await expect(section.getByText("erp-ui-renomeado")).toBeVisible();
  });
});
