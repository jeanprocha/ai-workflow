import { test, expect } from "../../helpers/fixtures";
import { API_URL, buildTestUser, registerViaApi, buildStorageState, authenticateContext } from "../../helpers/auth";
import { createCredentialViaApi, fetchWorkspaceId, workspaceHeaders } from "../../helpers/settings";
import {
  createWorkflowViaApi,
  saveGraphViaApi,
  runWorkflowViaApi,
  waitForExecutionStatus,
  FAILING_GRAPH,
  TWO_NODE_GRAPH,
} from "../../helpers/workflows";

/**
 * Fase 10 — IA de plataforma (UI). Validacoes deterministicas puras em
 * api.spec.ts. Aqui: os caminhos de erro deterministicos QUE PASSAM PELA UI
 * (sem gastar token), mais os caminhos felizes reais marcados @ai.
 *
 * Armadilha documentada na discovery: o frontend tem timeout de 30s
 * (api-client.ts) — Autocomplete/Copilot reais podem estourar isso (fazem
 * ate 2 chamadas de LLM / mandam o grafo inteiro no prompt). Por isso os
 * @ai de Autocomplete e Copilot rodam via API (sem esse teto); so o
 * Debugger (prompt curto, resposta pequena) roda @ai pela UI.
 *
 * Rodar os @ai sob demanda com: playwright test --grep @ai
 * Exige E2E_ANTHROPIC_KEY no ambiente (mesmo padrao da Fase 06).
 */

test.describe("AI Debugger — erro determinístico via UI", () => {
  test("sem credencial: toast com a mensagem real do servidor; dialog com descricao acessivel", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Debugger UI Sem Credencial");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, FAILING_GRAPH);
    const exec = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, exec.id, "failed");

    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto(`/executions/${done.id}`);

    await page.getByRole("button", { name: "Diagnosticar com IA" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "AI Debugger" })).toBeVisible();
    // Fix A3: descricao do dialog agora e um DialogDescription de verdade
    // (aria-describedby), nao um <p> solto.
    await expect(
      dialog.getByText(
        "Analisa o erro, os logs e a config do node que falhou, e sugere causa provavel + correcoes aplicaveis com um clique.",
      ),
    ).toBeVisible();

    await dialog.getByRole("button", { name: "Diagnosticar" }).click();
    await expect(page.getByText("Informe a credencial do provider de IA.")).toBeVisible();
  });
});

test.describe("Copilot — erro determinístico via UI", () => {
  test("textarea acessivel (valida fix A1); enviar sem credencial mostra erro e remove a mensagem (rollback)", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Copilot UI Sem Credencial");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, TWO_NODE_GRAPH);
    await authenticateContext(context, await buildStorageState(request, tokens));

    await page.goto(`/flows/${workflow.id}`);
    await page.getByRole("button", { name: "Copilot" }).click();

    const dialog = page.getByRole("dialog");
    // aria-label da textarea (fix A1) — antes so tinha placeholder.
    const messageInput = dialog.getByLabel("Mensagem para o Copilot");
    await expect(messageInput).toBeVisible();
    await messageInput.fill("Como melhorar este fluxo?");
    await dialog.getByLabel("Enviar mensagem").click();

    await expect(page.getByText("Informe a credencial do provider de IA.")).toBeVisible();
    // Rollback: a mensagem do usuario e removida do array ao falhar, entao a
    // dica inicial ("Pergunte algo, ou tente:") volta a aparecer — ela so
    // renderiza quando messages.length === 0. (Nao da pra checar a simples
    // ausencia do texto enviado: um dos chips de sugestao tem exatamente a
    // mesma frase "Como melhorar este fluxo?".)
    await expect(dialog.getByText("Pergunte algo, ou tente:")).toBeVisible();
  });
});

test.describe("Gerar com IA (Autocomplete) — erro determinístico via UI", () => {
  test("sem credencial: toast com a mensagem real do servidor", async ({ page, context, request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    // Precisa de pelo menos 1 fluxo pra o botao do header existir (mesmo
    // padrao de Agents/Knowledge/MCP) — ou usar a acao do empty state.
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/flows");

    await page.getByRole("button", { name: "Gerar com IA" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Gerar fluxo com IA" })).toBeVisible();
    await expect(
      dialog.getByText("Descreva o que o fluxo deve fazer e a IA gera o grafo pra voce revisar."),
    ).toBeVisible();

    await dialog
      .getByLabel("Descreva o que o fluxo deve fazer")
      .fill("Quando chegar um email, salvar no banco.");
    await dialog.getByRole("button", { name: "Gerar", exact: true }).click();

    await expect(page.getByText("Informe a credencial do provider de IA.")).toBeVisible();
  });
});

test.describe("Caminhos felizes com IA real", () => {
  test("@ai autocomplete via API gera um grafo valido", async ({ request }) => {
    const apiKey = process.env.E2E_ANTHROPIC_KEY;
    test.skip(!apiKey, "E2E_ANTHROPIC_KEY nao definida — teste de IA real pulado.");

    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    await createCredentialViaApi(request, tokens, workspaceId, {
      provider: "anthropic",
      name: "anthropic-e2e",
      value: apiKey!,
    });

    const response = await request.post(`${API_URL}/autocomplete/generate`, {
      headers: workspaceHeaders(tokens, workspaceId),
      data: {
        prompt: "Crie um fluxo com um trigger manual e um node de log dizendo ola.",
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        credential: "anthropic-e2e",
      },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.suggestionId).toBeTruthy();
    expect(body.graph.nodes.length).toBeGreaterThan(0);
    expect(body.graph.nodes.some((node: { category: string }) => node.category === "trigger")).toBe(
      true,
    );
  });

  test("@ai debugger via UI diagnostica e aplica uma correcao", async ({
    page,
    context,
    request,
  }) => {
    const apiKey = process.env.E2E_ANTHROPIC_KEY;
    test.skip(!apiKey, "E2E_ANTHROPIC_KEY nao definida — teste de IA real pulado.");

    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    await createCredentialViaApi(request, tokens, workspaceId, {
      provider: "anthropic",
      name: "anthropic-e2e",
      value: apiKey!,
    });

    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Debugger AI Real");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, FAILING_GRAPH);
    const exec = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, exec.id, "failed");

    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto(`/executions/${done.id}`);

    await page.getByRole("button", { name: "Diagnosticar com IA" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Modelo").fill("claude-haiku-4-5-20251001");
    await dialog.getByLabel("Conexao (credential)").fill("anthropic-e2e");
    await dialog.getByRole("button", { name: "Diagnosticar" }).click();

    await expect(dialog.getByText("Possivel causa")).toBeVisible({ timeout: 60_000 });
    await dialog.getByRole("button", { name: "Aplicar", exact: true }).first().click();
    await expect(page.getByText("Correcao aplicada — uma nova versao do fluxo foi salva.")).toBeVisible({
      timeout: 30_000,
    });
  });

  test("@ai copilot via API responde sobre o fluxo real", async ({ request }) => {
    const apiKey = process.env.E2E_ANTHROPIC_KEY;
    test.skip(!apiKey, "E2E_ANTHROPIC_KEY nao definida — teste de IA real pulado.");

    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    await createCredentialViaApi(request, tokens, workspaceId, {
      provider: "anthropic",
      name: "anthropic-e2e",
      value: apiKey!,
    });
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Copilot AI Real");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, TWO_NODE_GRAPH);

    const response = await request.post(`${API_URL}/workflows/${workflow.id}/copilot/chat`, {
      headers: workspaceHeaders(tokens, workspaceId),
      data: {
        message: "Como melhorar este fluxo?",
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        credential: "anthropic-e2e",
      },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.content.length).toBeGreaterThan(0);
  });
});
