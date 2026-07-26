import { test, expect } from "../../helpers/fixtures";
import {
  buildTestUser,
  registerViaApi,
  buildStorageState,
  authenticateContext,
} from "../../helpers/auth";
import { fetchWorkspaceId } from "../../helpers/settings";
import {
  createWorkflowViaApi,
  saveGraphViaApi,
  runWorkflowViaApi,
  waitForExecutionStatus,
  MINIMAL_GRAPH,
  FAILING_GRAPH,
} from "../../helpers/workflows";

/**
 * Fase 09 — Dashboard (UI). Analytics/Cost Optimizer ficam em specs proprios;
 * validacoes puras de API em api.spec.ts.
 *
 * Precisa do worker rodando (execucoes ficam presas em "Na fila" sem ele).
 *
 * ARMADILHA CENTRAL DA FASE: os endpoints de /analytics/* tem cache Redis
 * por workspace (summary 30s, recent-executions 10s) — sempre SEMEAR os
 * dados via API ANTES de navegar pra pagina. Ler antes de semear (ou dar
 * reload esperando dado novo dentro do TTL) deixa o resultado zerado
 * cacheado e o teste falha de forma confusa.
 *
 * Armadilhas de locator mapeadas na discovery:
 * - MetricCard agora tem role="group" + aria-label={label} (fix A2 desta
 *   fase) — sem isso "Execuções"/"Fluxos" colidiam com o link do sidebar.
 * - MetricCard com href vira <a> (role "link") em vez de <div role="group">:
 *   no dashboard so "Falhas" ganha href, e so quando o valor e > 0.
 * - "Tempo médio" usa ponto decimal fixo (toFixed), NUNCA vírgula mesmo em
 *   pt-BR: "0.0s", "1.2s".
 * - "Custo IA" e "US$ 0,00" (moeda sempre USD, separador pelo locale).
 * - EmptyState nao anuncia mais "Carregando" (fix A1) — antes TODO empty
 *   state da plataforma tinha role="status" com esse texto.
 * - Tabela de recentes tem no maximo 5 linhas (limite hardcoded no backend).
 */

test.describe("Dashboard", () => {
  test("workspace novo: cards zerados e empty state sem anuncio de Carregando", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();

    await expect(page.getByRole("group", { name: "Fluxos" })).toContainText("0");
    await expect(page.getByRole("group", { name: "Execuções", exact: true })).toContainText("0");
    await expect(page.getByRole("group", { name: "Requisições de IA" })).toContainText("0");
    await expect(page.getByRole("group", { name: "Tempo médio" })).toContainText("0.0s");
    await expect(page.getByRole("group", { name: "Falhas" })).toContainText("0");
    await expect(page.getByRole("group", { name: "Custo IA", exact: true })).toContainText("US$ 0,00");

    const emptyHeading = page.getByRole("heading", { name: "Nenhuma execução ainda" });
    await expect(emptyHeading).toBeVisible();
    await expect(page.getByText("Execute um fluxo para ver o histórico aqui.")).toBeVisible();

    // Fix A1: o Pulse decorativo do EmptyState nao deve mais se anunciar
    // como "Carregando" pra leitor de tela.
    const emptyContainer = emptyHeading.locator("xpath=../..");
    await expect(emptyContainer.getByRole("status")).toHaveCount(0);
  });

  test("com execucoes semeadas: cards refletem os dados e tabela mostra as recentes", async ({
    page,
    context,
    request,
  }) => {
    // Duas execucoes semeadas em serie, e waitForExecutionStatus sozinho ja
    // orca 30s por execucao (fila com concurrency=5) — o default de 30s do
    // Playwright mata o teste antes do proprio helper poder esperar.
    test.setTimeout(90_000);
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);

    // SEMEAR PRIMEIRO (cache de 30s/10s so e populado na primeira leitura).
    const wfOk = await createWorkflowViaApi(request, tokens, workspaceId, "Dashboard Fluxo OK");
    await saveGraphViaApi(request, tokens, workspaceId, wfOk.id, MINIMAL_GRAPH);
    await runWorkflowViaApi(request, tokens, workspaceId, wfOk.id).then((exec) =>
      waitForExecutionStatus(request, tokens, workspaceId, exec.id, "success"),
    );

    const wfFail = await createWorkflowViaApi(request, tokens, workspaceId, "Dashboard Fluxo Falha");
    await saveGraphViaApi(request, tokens, workspaceId, wfFail.id, FAILING_GRAPH);
    await runWorkflowViaApi(request, tokens, workspaceId, wfFail.id).then((exec) =>
      waitForExecutionStatus(request, tokens, workspaceId, exec.id, "failed"),
    );

    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/dashboard");

    await expect(page.getByRole("group", { name: "Fluxos" })).toContainText("2");
    await expect(page.getByRole("group", { name: "Execuções", exact: true })).toContainText("2");
    // Falhas > 0 ganha href -> o card vira <a role="link"> (aria-label continua "Falhas").
    await expect(page.getByRole("link", { name: "Falhas" })).toContainText("1");
    // Duracao real varia — so garante que nao ficou no zero-state.
    await expect(page.getByRole("group", { name: "Tempo médio" })).not.toContainText("0.0s");

    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    const rows = table.locator("tbody tr");
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: "Dashboard Fluxo OK" }).getByText("Sucesso")).toBeVisible();
    await expect(rows.filter({ hasText: "Dashboard Fluxo Falha" }).getByText("Falhou")).toBeVisible();
    await expect(rows.filter({ hasText: "Dashboard Fluxo OK" }).getByRole("link")).toHaveAttribute(
      "href",
      /\/executions\//,
    );

    // O card de Falhas promete levar ao que quebrou — o destino tem que
    // chegar JA FILTRADO. Sem isso o link abre a lista inteira e a promessa
    // do card e falsa (as 2 execucoes semeadas apareceriam, nao so a falha).
    await page.getByRole("link", { name: "Falhas" }).click();
    await expect(page).toHaveURL(/\/executions\?status=failed$/);
    const filtered = page.getByRole("table").locator("tbody tr");
    await expect(filtered).toHaveCount(1);
    await expect(filtered.first()).toContainText("Dashboard Fluxo Falha");
  });

  test('"Ver todas" navega pra /executions', async ({ page, context, request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/dashboard");

    await page.getByRole("button", { name: "Ver todas" }).click();
    await expect(page).toHaveURL(/\/executions$/);
  });

  test("tabela de recentes mostra no maximo 5 linhas", async ({ page, context, request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Dashboard Limite 5");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, MINIMAL_GRAPH);

    // Fire-and-forget: a contagem de linhas nao depende do status terminar.
    for (let i = 0; i < 6; i++) {
      await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    }

    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/dashboard");

    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(5);
  });
});
