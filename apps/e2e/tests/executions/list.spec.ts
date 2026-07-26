import { test, expect } from "../../helpers/fixtures";
import type { APIRequestContext } from "@playwright/test";
import {
  buildTestUser,
  registerViaApi,
  buildStorageState,
  authenticateContext,
  type AuthTokens,
} from "../../helpers/auth";
import { fetchWorkspaceId } from "../../helpers/settings";
import {
  createWorkflowViaApi,
  saveGraphViaApi,
  runWorkflowViaApi,
  waitForExecutionStatus,
  MINIMAL_GRAPH,
  FAILING_GRAPH,
  type ExecutionSummary,
} from "../../helpers/workflows";

/**
 * Fase 05 — Executions (lista). Detalhe/timeline/replay ficam em detail.spec.ts;
 * validacoes puras de API em api.spec.ts.
 *
 * Precisa do worker rodando — sem ele as execucoes ficam presas em "queued"
 * e os testes que esperam "success"/"failed" estouram o timeout do poll
 * (waitForExecutionStatus). Cada teste registra seu proprio usuario ->
 * workspace isolado, entao nao ha risco de uma execucao de um teste vazar
 * na lista de outro rodando em paralelo.
 *
 * FAILING_GRAPH aponta pra porta discard (127.0.0.1:9) — connection refused
 * em ~5ms, unica forma deterministica de produzir status "failed" sem
 * depender de um provedor de IA/credencial real.
 */

async function runAndWait(
  request: APIRequestContext,
  tokens: AuthTokens,
  workspaceId: string,
  workflowId: string,
  status: ExecutionSummary["status"],
): Promise<ExecutionSummary> {
  const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflowId);
  return waitForExecutionStatus(request, tokens, workspaceId, execution.id, status);
}

test.describe("Executions (lista)", () => {
  test("estado vazio mostra convite pra ir aos Flows", async ({ page, context, request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/executions");

    await expect(page.getByRole("heading", { name: "Nenhuma execução ainda" })).toBeVisible();
    await expect(page.getByText("Execute um fluxo para ver o histórico aqui.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Ir para Fluxos" })).toBeVisible();
  });

  test("execucao concluida aparece na tabela com badge, trigger e duracao", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo Sucesso Lista");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, MINIMAL_GRAPH);
    await runAndWait(request, tokens, workspaceId, workflow.id, "success");

    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/executions");

    const row = page.locator("tbody tr").filter({ hasText: "Fluxo Sucesso Lista" });
    await expect(row).toBeVisible();
    await expect(row.locator("td").nth(1)).toContainText("Sucesso");
    await expect(row.locator("td").nth(2)).toHaveText("manual");
    await expect(row.locator("td").nth(3)).not.toHaveText("—");
  });

  test("filtro de status isola execucoes falhadas", async ({ page, context, request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo Filtro Status");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, MINIMAL_GRAPH);
    await runAndWait(request, tokens, workspaceId, workflow.id, "success");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, FAILING_GRAPH);
    await runAndWait(request, tokens, workspaceId, workflow.id, "failed");

    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/executions");
    await expect(page.locator("tbody tr")).toHaveCount(2);

    await page.getByLabel("Filtrar por status").selectOption("failed");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr").first().locator("td").nth(1)).toContainText("Falhou");

    await page.getByLabel("Filtrar por status").selectOption("");
    await expect(page.locator("tbody tr")).toHaveCount(2);
  });

  test("filtro de fluxo isola execucoes por workflow", async ({ page, context, request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflowA = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo Alfa Filtro");
    const workflowB = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo Beta Filtro");
    await saveGraphViaApi(request, tokens, workspaceId, workflowA.id, MINIMAL_GRAPH);
    await saveGraphViaApi(request, tokens, workspaceId, workflowB.id, MINIMAL_GRAPH);
    await runAndWait(request, tokens, workspaceId, workflowA.id, "success");
    await runAndWait(request, tokens, workspaceId, workflowB.id, "success");

    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/executions");
    await expect(page.locator("tbody tr")).toHaveCount(2);

    await page.getByLabel("Filtrar por fluxo").selectOption({ label: "Fluxo Beta Filtro" });
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr").first()).toContainText("Fluxo Beta Filtro");
  });

  test("busca por nome do fluxo e case-insensitive por substring", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflowA = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo Alpha Busca");
    const workflowB = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo Beta Busca");
    await saveGraphViaApi(request, tokens, workspaceId, workflowA.id, MINIMAL_GRAPH);
    await saveGraphViaApi(request, tokens, workspaceId, workflowB.id, MINIMAL_GRAPH);
    await runAndWait(request, tokens, workspaceId, workflowA.id, "success");
    await runAndWait(request, tokens, workspaceId, workflowB.id, "success");

    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/executions");
    await expect(page.locator("tbody tr")).toHaveCount(2);

    await page.getByPlaceholder("Buscar por nome do fluxo...").fill("alpha");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr").first()).toContainText("Fluxo Alpha Busca");

    await page.getByPlaceholder("Buscar por nome do fluxo...").fill("nao existe termo nenhum");
    await expect(page.getByRole("heading", { name: "Nenhuma execução ainda" })).toBeVisible();
  });

  test("paginacao com 21 execucoes: 2 paginas, Anterior/Proxima corretos", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo Paginacao");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, MINIMAL_GRAPH);
    // Enfileiradas sem esperar o worker — paginacao nao depende de status.
    for (let i = 0; i < 21; i++) {
      await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    }

    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/executions");

    await expect(page.getByText("21 execuções · página 1 de 2")).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(20);
    const previous = page.getByRole("button", { name: "Anterior" });
    const next = page.getByRole("button", { name: "Próxima" });
    await expect(previous).toBeDisabled();
    await expect(next).toBeEnabled();

    await next.click();
    await expect(page.getByText("21 execuções · página 2 de 2")).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(previous).toBeEnabled();
    await expect(next).toBeDisabled();

    await previous.click();
    await expect(page.getByText("21 execuções · página 1 de 2")).toBeVisible();
  });

  test("Reexecutar so aparece em linhas falhadas e enfileira um replay", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflowOk = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo OK Retry");
    const workflowFail = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo Falha Retry");
    await saveGraphViaApi(request, tokens, workspaceId, workflowOk.id, MINIMAL_GRAPH);
    await saveGraphViaApi(request, tokens, workspaceId, workflowFail.id, FAILING_GRAPH);
    await runAndWait(request, tokens, workspaceId, workflowOk.id, "success");
    await runAndWait(request, tokens, workspaceId, workflowFail.id, "failed");

    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/executions");

    const okRow = page.locator("tbody tr").filter({ hasText: "Fluxo OK Retry" });
    const failRow = page.locator("tbody tr").filter({ hasText: "Fluxo Falha Retry" });
    await expect(okRow.getByRole("button", { name: "Reexecutar" })).toHaveCount(0);
    await expect(failRow.getByRole("button", { name: "Reexecutar" })).toBeVisible();

    await failRow.getByRole("button", { name: "Reexecutar" }).click();
    await expect(page.getByText("Nova execução enfileirada.")).toBeVisible();

    const replayRow = page
      .locator("tbody tr")
      .filter({ hasText: "Fluxo Falha Retry" })
      .filter({ hasText: "(replay)" });
    await expect(replayRow).toBeVisible();
  });
});
