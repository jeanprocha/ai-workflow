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
 * Fase 09 — Analytics (UI). Sem lib de graficos: sao SVGs artesanais em
 * simple-charts.tsx. Mesma armadilha de cache Redis do dashboard.spec.ts —
 * semear antes de navegar.
 *
 * Fix A2 desta fase: os LineChart agora tem role="img" + aria-label — o
 * locator estavel dos graficos. Sem dados, o componente renderiza so um
 * <p> (nao ha <svg>), entao o role="img" so existe quando ha pontos.
 */

test.describe("Analytics", () => {
  test("workspace novo: cards zerados e graficos em estado vazio", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/analytics");

    await expect(page.getByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();

    await expect(page.getByRole("group", { name: "Execucoes", exact: true })).toContainText("0");
    await expect(page.getByRole("group", { name: "Taxa de falha" })).toContainText("0,0%");
    await expect(page.getByRole("group", { name: "Tokens totais" })).toContainText("0");
    await expect(page.getByRole("group", { name: "Custo IA total" })).toContainText("US$ 0,00");

    await expect(page.getByText("Sem dados no periodo.")).toHaveCount(2);
    await expect(page.getByText("Sem dados.", { exact: true })).toBeVisible();

    // Sem pontos, o LineChart nem renderiza <svg role="img">.
    await expect(page.getByRole("img", { name: "Grafico de execucoes por dia" })).toHaveCount(0);
    await expect(page.getByRole("img", { name: "Grafico de falhas por dia" })).toHaveCount(0);
  });

  test("com execucoes semeadas: cards e graficos refletem os dados (valida fix A2)", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);

    const wfOk = await createWorkflowViaApi(request, tokens, workspaceId, "Analytics Fluxo OK");
    await saveGraphViaApi(request, tokens, workspaceId, wfOk.id, MINIMAL_GRAPH);
    await runWorkflowViaApi(request, tokens, workspaceId, wfOk.id).then((exec) =>
      waitForExecutionStatus(request, tokens, workspaceId, exec.id, "success"),
    );
    await runWorkflowViaApi(request, tokens, workspaceId, wfOk.id).then((exec) =>
      waitForExecutionStatus(request, tokens, workspaceId, exec.id, "success"),
    );

    const wfFail = await createWorkflowViaApi(request, tokens, workspaceId, "Analytics Fluxo Falha");
    await saveGraphViaApi(request, tokens, workspaceId, wfFail.id, FAILING_GRAPH);
    await runWorkflowViaApi(request, tokens, workspaceId, wfFail.id).then((exec) =>
      waitForExecutionStatus(request, tokens, workspaceId, exec.id, "failed"),
    );
    await runWorkflowViaApi(request, tokens, workspaceId, wfFail.id).then((exec) =>
      waitForExecutionStatus(request, tokens, workspaceId, exec.id, "failed"),
    );

    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/analytics");

    await expect(page.getByRole("group", { name: "Execucoes", exact: true })).toContainText("4");
    await expect(page.getByRole("group", { name: "Taxa de falha" })).toContainText("50,0%");
    // Sem steps de IA — tokens/custo continuam zerados mesmo com execucoes reais.
    await expect(page.getByRole("group", { name: "Tokens totais" })).toContainText("0");
    await expect(page.getByRole("group", { name: "Custo IA total" })).toContainText("US$ 0,00");
    await expect(page.getByText("Sem dados.", { exact: true })).toBeVisible();

    // Todas as execucoes de hoje caem no mesmo dia (granularidade diaria) — 1 ponto.
    const execChart = page.getByRole("img", { name: "Grafico de execucoes por dia" });
    await expect(execChart).toBeVisible();
    await expect(execChart.locator("circle")).toHaveCount(1);
    await expect(execChart.locator("polyline")).toHaveCount(1);

    const failChart = page.getByRole("img", { name: "Grafico de falhas por dia" });
    await expect(failChart).toBeVisible();
    await expect(failChart.locator("circle")).toHaveCount(1);
  });
});
