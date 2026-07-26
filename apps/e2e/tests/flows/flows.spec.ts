import { test, expect } from "../../helpers/fixtures";
import {
  API_URL,
  buildTestUser,
  registerViaApi,
  buildStorageState,
  authenticateContext,
} from "../../helpers/auth";
import { fetchWorkspaceId, workspaceHeaders } from "../../helpers/settings";
import {
  MINIMAL_GRAPH,
  createWorkflowViaApi,
  saveGraphViaApi,
} from "../../helpers/workflows";

/**
 * Fase 03 — Flows (lista). O editor (canvas) e a Fase 04.
 *
 * Armadilhas de locator mapeadas na discovery:
 * - Cada card e um <Link> — o menu (MoreHorizontal) fica DENTRO do link, num
 *   wrapper que so faz preventDefault. Clique impreciso navega pro editor.
 *   O trigger tem aria-label "Ações do fluxo <nome>" (fix desta fase).
 * - "Criar fluxo" e ao mesmo tempo o botao da pagina E o submit do dialog —
 *   escopar no dialog depois de abrir.
 * - O dropdown e o dialog montam em portal — buscar via page, nunca na card.
 * - Titulo do dialog de exclusao usa aspas tipograficas: Excluir o fluxo “X”?
 */

test.describe("Flows (via UI)", () => {
  test("empty state -> criar do zero -> card com badge Rascunho, sem navegar", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/flows");

    await expect(
      page.getByRole("heading", { name: "Nenhum fluxo ainda" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Criar fluxo" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nome").fill("Meu Primeiro Fluxo");
    await dialog.getByRole("button", { name: "Criar fluxo" }).click();

    await expect(page.getByText("Fluxo criado.")).toBeVisible();
    // Continua na lista (criar do zero NAO navega pro editor).
    await expect(page).toHaveURL(/\/flows$/);
    const card = page.getByRole("link", { name: /Meu Primeiro Fluxo/ });
    await expect(card).toBeVisible();
    await expect(card.getByText("Rascunho")).toBeVisible();
  });

  test("clicar no card navega pro editor /flows/{id}", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(
      request,
      tokens,
      workspaceId,
      "Fluxo Navegavel",
    );
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/flows");

    await page.getByRole("link", { name: /Fluxo Navegavel/ }).click();
    await expect(page).toHaveURL(new RegExp(`/flows/${workflow.id}$`));
  });

  test("renomear via menu do card", async ({ page, context, request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    await createWorkflowViaApi(request, tokens, workspaceId, "Nome Antigo");
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/flows");

    await page.getByLabel("Ações do fluxo Nome Antigo").click();
    await page.getByRole("menuitem", { name: "Renomear" }).click();

    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Renomear fluxo" }),
    ).toBeVisible();
    // Campo ja vem preenchido com o nome atual.
    await expect(dialog.getByLabel("Nome")).toHaveValue("Nome Antigo");

    await dialog.getByLabel("Nome").fill("Nome Novo");
    await dialog.getByRole("button", { name: "Salvar" }).click();

    await expect(page.getByText("Fluxo renomeado.")).toBeVisible();
    await expect(page.getByRole("link", { name: /Nome Novo/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Nome Antigo/ })).not.toBeVisible();
  });

  test("ativar e arquivar pelo menu: badge acompanha o status", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo Status");
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/flows");

    const card = page.getByRole("link", { name: /Fluxo Status/ });
    await expect(card.getByText("Rascunho")).toBeVisible();

    // Draft mostra "Ativar" (o toggle so alterna active <-> archived).
    await page.getByLabel("Ações do fluxo Fluxo Status").click();
    await page.getByRole("menuitem", { name: "Ativar" }).click();
    await expect(page.getByText("Fluxo ativado.")).toBeVisible();
    await expect(card.getByText("Ativo")).toBeVisible();

    await page.getByLabel("Ações do fluxo Fluxo Status").click();
    await page.getByRole("menuitem", { name: "Arquivar" }).click();
    await expect(page.getByText("Fluxo arquivado.")).toBeVisible();
    await expect(card.getByText("Arquivado")).toBeVisible();
  });

  test("excluir: confirmacao com nome do fluxo, cancela e depois remove", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo Descartavel");
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/flows");

    await page.getByLabel("Ações do fluxo Fluxo Descartavel").click();
    await page.getByRole("menuitem", { name: "Excluir" }).click();

    const alert = page.getByRole("alertdialog");
    // Aspas tipograficas (U+201C/U+201D) no titulo.
    await expect(
      alert.getByRole("heading", { name: "Excluir o fluxo “Fluxo Descartavel”?" }),
    ).toBeVisible();

    await alert.getByRole("button", { name: "Cancelar" }).click();
    await expect(alert).not.toBeVisible();
    await expect(page.getByRole("link", { name: /Fluxo Descartavel/ })).toBeVisible();

    await page.getByLabel("Ações do fluxo Fluxo Descartavel").click();
    await page.getByRole("menuitem", { name: "Excluir" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Excluir" })
      .click();

    await expect(page.getByText("Fluxo excluído.")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Nenhum fluxo ainda" }),
    ).toBeVisible();
  });

  test("dialog Gerar com IA: campos de provider e aviso quando nao ha credencial", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/flows");

    await page.getByRole("button", { name: "Gerar com IA" }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Gerar fluxo com IA" }),
    ).toBeVisible();
    await expect(
      dialog.getByLabel("Descreva o que o fluxo deve fazer"),
    ).toBeVisible();
    await expect(dialog.getByLabel("Provider")).toHaveValue("anthropic");

    // Workspace novo sem credencial: hint aponta pra Configuracoes.
    await expect(
      dialog.getByText(
        "Cadastre uma credencial de anthropic em Configurações → Credenciais.",
      ),
    ).toBeVisible();

    // Ollama roda local — o campo de credencial some e o aviso muda.
    await dialog.getByLabel("Provider").selectOption("ollama");
    await expect(
      dialog.getByText("Ollama roda local — não precisa de credencial."),
    ).toBeVisible();
    await expect(dialog.getByLabel("Conexão (credential)")).not.toBeVisible();
  });
});

test.describe("Flows via API", () => {
  test("POST /workflows cria draft com versao 1 e grafo vazio", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);

    const response = await request.post(`${API_URL}/workflows`, {
      headers: workspaceHeaders(tokens, workspaceId),
      data: { name: "Fluxo API" },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({ name: "Fluxo API", status: "draft" });
    expect(body.currentVersion.versionNumber).toBe(1);
    expect(body.currentVersion.graph).toEqual({
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    // Sem node trigger.webhook no grafo, nenhum webhookId e gerado.
    expect(body.webhookId).toBeNull();
  });

  test("POST /workflows sem nome ou com campo extra -> 400", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const noName = await request.post(`${API_URL}/workflows`, {
      headers,
      data: {},
    });
    expect(noName.status()).toBe(400);

    const extraProp = await request.post(`${API_URL}/workflows`, {
      headers,
      data: { name: "ok", nodes: [] },
    });
    expect(extraProp.status()).toBe(400);
  });

  test("PATCH aceita os 3 status validos e rejeita invalido", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const workflow = await createWorkflowViaApi(
      request,
      tokens,
      workspaceId,
      "Muda Status",
    );

    for (const status of ["active", "archived", "draft"] as const) {
      const response = await request.patch(
        `${API_URL}/workflows/${workflow.id}`,
        { headers, data: { status } },
      );
      expect(response.ok()).toBe(true);
      expect((await response.json()).status).toBe(status);
    }

    const invalid = await request.patch(`${API_URL}/workflows/${workflow.id}`, {
      headers,
      data: { status: "publicado" },
    });
    expect(invalid.status()).toBe(400);
  });

  test("GET /workflows/:id inexistente -> 404 pt e traduzido em en", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const missingId = "00000000-0000-0000-0000-000000000000";

    const pt = await request.get(`${API_URL}/workflows/${missingId}`, { headers });
    expect(pt.status()).toBe(404);
    expect((await pt.json()).message).toBe("Fluxo nao encontrado.");

    const en = await request.get(`${API_URL}/workflows/${missingId}`, {
      headers: { ...headers, "x-lang": "en" },
    });
    expect((await en.json()).message).toBe("Flow not found.");
  });

  test.describe("grafo e versoes", () => {
    test("save valido cria v2; save invalido -> 400 Grafo invalido com issues", async ({
      request,
    }) => {
      const tokens = await registerViaApi(request, buildTestUser());
      const workspaceId = await fetchWorkspaceId(request, tokens);
      const headers = workspaceHeaders(tokens, workspaceId);
      const workflow = await createWorkflowViaApi(
        request,
        tokens,
        workspaceId,
        "Versionado",
      );

      const saved = await request.put(
        `${API_URL}/workflows/${workflow.id}/graph`,
        { headers, data: { graph: MINIMAL_GRAPH } },
      );
      expect(saved.ok()).toBe(true);
      expect((await saved.json()).currentVersion.versionNumber).toBe(2);

      // Node com type fora do catalogo: barrado pela validacao cruzada do zod.
      const invalidGraph = {
        ...MINIMAL_GRAPH,
        nodes: [
          { ...MINIMAL_GRAPH.nodes[0], type: "trigger.inventado" },
        ],
      };
      const rejected = await request.put(
        `${API_URL}/workflows/${workflow.id}/graph`,
        { headers, data: { graph: invalidGraph } },
      );
      expect(rejected.status()).toBe(400);
      const body = (await rejected.json()) as {
        message: string;
        issues: Array<{ message: string }>;
      };
      expect(body.message).toBe("Grafo invalido.");
      expect(body.issues.map((issue) => issue.message)).toContain(
        'Tipo de node desconhecido: "trigger.inventado".',
      );

      // Edge apontando pra node que nao existe no grafo.
      const danglingEdge = {
        ...MINIMAL_GRAPH,
        edges: [{ id: "e1", source: "n1", target: "fantasma" }],
      };
      const rejectedEdge = await request.put(
        `${API_URL}/workflows/${workflow.id}/graph`,
        { headers, data: { graph: danglingEdge } },
      );
      expect(rejectedEdge.status()).toBe(400);
      const edgeBody = (await rejectedEdge.json()) as {
        issues: Array<{ message: string }>;
      };
      expect(edgeBody.issues.map((issue) => issue.message)).toContain(
        'Edge referencia um node de destino inexistente: "fantasma".',
      );
    });

    test("rollback cria versao NOVA com o grafo antigo (historico linear)", async ({
      request,
    }) => {
      const tokens = await registerViaApi(request, buildTestUser());
      const workspaceId = await fetchWorkspaceId(request, tokens);
      const headers = workspaceHeaders(tokens, workspaceId);
      const workflow = await createWorkflowViaApi(
        request,
        tokens,
        workspaceId,
        "Com Rollback",
      );

      // v2: grafo com 1 node; v3: grafo com 2 nodes.
      await saveGraphViaApi(request, tokens, workspaceId, workflow.id);
      const twoNodes = {
        ...MINIMAL_GRAPH,
        nodes: [
          ...MINIMAL_GRAPH.nodes,
          {
            id: "n2",
            type: "logic.log",
            category: "logic",
            label: "Log",
            position: { x: 240, y: 0 },
            config: { value: "oi" },
          },
        ],
        edges: [{ id: "e1", source: "n1", target: "n2" }],
      };
      await saveGraphViaApi(request, tokens, workspaceId, workflow.id, twoNodes);

      const versions = await request.get(
        `${API_URL}/workflows/${workflow.id}/versions`,
        { headers },
      );
      const list = (await versions.json()) as Array<{
        id: string;
        versionNumber: number;
        isCurrent: boolean;
      }>;
      expect(list.map((v) => v.versionNumber)).toEqual([3, 2, 1]);
      expect(list.find((v) => v.versionNumber === 3)?.isCurrent).toBe(true);

      // Rollback pra v2 nao move ponteiro pra tras: cria a v4 clonando a v2.
      const v2 = list.find((v) => v.versionNumber === 2)!;
      const rollback = await request.post(
        `${API_URL}/workflows/${workflow.id}/versions/${v2.id}/rollback`,
        { headers },
      );
      expect(rollback.status()).toBe(201);
      const after = await rollback.json();
      expect(after.currentVersion.versionNumber).toBe(4);
      expect(after.currentVersion.graph.nodes).toHaveLength(1);

      // Versao de outro workflow (id qualquer) -> 404 especifico.
      const foreign = await request.post(
        `${API_URL}/workflows/${workflow.id}/versions/00000000-0000-0000-0000-000000000000/rollback`,
        { headers },
      );
      expect(foreign.status()).toBe(404);
      expect((await foreign.json()).message).toBe("Versao nao encontrada.");
    });
  });

  test("DELETE de fluxo COM execucao no historico funciona (regressao FK)", async ({
    request,
  }) => {
    // O FK executions.version_id e ON DELETE RESTRICT enquanto o delete do
    // workflow cascateia versoes E execucoes na mesma operacao — verificado
    // ao vivo que o Postgres resolve a ordem dos cascades sem violar o
    // RESTRICT. Este teste trava esse comportamento contra regressao (ex.:
    // uma mudanca de schema que troque a ordem/forma dos cascades).
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const workflow = await createWorkflowViaApi(
      request,
      tokens,
      workspaceId,
      "Deletar Com Historico",
    );
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id);

    const run = await request.post(`${API_URL}/workflows/${workflow.id}/run`, {
      headers,
      data: {},
    });
    expect(run.status()).toBe(201);

    const deleted = await request.delete(`${API_URL}/workflows/${workflow.id}`, {
      headers,
    });
    expect(deleted.ok()).toBe(true);

    const gone = await request.get(`${API_URL}/workflows/${workflow.id}`, {
      headers,
    });
    expect(gone.status()).toBe(404);
  });

  test("run com grafo vazio: aceito na hora, falha async com erro claro", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const workflow = await createWorkflowViaApi(
      request,
      tokens,
      workspaceId,
      "Sem Trigger",
    );

    // O enqueue nao valida o grafo — a resposta e 201 queued.
    const run = await request.post(`${API_URL}/workflows/${workflow.id}/run`, {
      headers,
      data: {},
    });
    expect(run.status()).toBe(201);
    const execution = await run.json();
    expect(execution.status).toBe("queued");

    // A falha aparece so quando o worker processa (precisa do worker rodando).
    await expect
      .poll(
        async () => {
          const response = await request.get(
            `${API_URL}/executions/${execution.id}`,
            { headers },
          );
          return (await response.json()).status;
        },
        { timeout: 15_000 },
      )
      .toBe("failed");

    const final = await request.get(`${API_URL}/executions/${execution.id}`, {
      headers,
    });
    expect((await final.json()).error).toBe("O fluxo nao possui um node trigger.");
  });

  test("isolamento: fluxo de A e 404 pro B; workspace alheio e 403", async ({
    request,
  }) => {
    const tokensA = await registerViaApi(request, buildTestUser());
    const workspaceA = await fetchWorkspaceId(request, tokensA);
    const workflow = await createWorkflowViaApi(
      request,
      tokensA,
      workspaceA,
      "Privado do A",
    );

    const tokensB = await registerViaApi(request, buildTestUser());
    const workspaceB = await fetchWorkspaceId(request, tokensB);

    const notFound = await request.get(`${API_URL}/workflows/${workflow.id}`, {
      headers: workspaceHeaders(tokensB, workspaceB),
    });
    expect(notFound.status()).toBe(404);

    const forbidden = await request.get(`${API_URL}/workflows/${workflow.id}`, {
      headers: workspaceHeaders(tokensB, workspaceA),
    });
    expect(forbidden.status()).toBe(403);
  });
});
