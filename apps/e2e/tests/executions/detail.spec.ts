import { test, expect } from "../../helpers/fixtures";
import type { Locator, Page } from "@playwright/test";
import {
  API_URL,
  buildTestUser,
  registerViaApi,
  buildStorageState,
  authenticateContext,
} from "../../helpers/auth";
import { fetchWorkspaceId, workspaceHeaders } from "../../helpers/settings";
import {
  createWorkflowViaApi,
  saveGraphViaApi,
  runWorkflowViaApi,
  waitForExecutionStatus,
  setWorkflowStatusViaApi,
  updateWorkflowViaApi,
  TWO_NODE_GRAPH,
  FAILING_GRAPH,
  DELAY_GRAPH,
  continueOnErrorGraph,
  errorHandlerGraph,
} from "../../helpers/workflows";

/**
 * Fase 05 — Executions (detalhe/timeline/replay/SSE). Lista fica em
 * list.spec.ts; validacoes puras de API em api.spec.ts.
 *
 * Precisa do worker rodando (mesmo motivo de list.spec.ts).
 */

function statusBadge(page: Page, workflowName: string): Locator {
  const heading = page.getByRole("heading", { level: 1, name: workflowName });
  return heading.locator("xpath=following-sibling::span[1]");
}

function metricValue(page: Page, label: string): Locator {
  return page.getByText(label, { exact: true }).locator("xpath=following-sibling::p[1]");
}

function timelineContainer(page: Page): Locator {
  return page
    .getByRole("heading", { name: "Timeline" })
    .locator("xpath=following-sibling::div[1]");
}

function logsContainer(page: Page): Locator {
  return page
    .getByRole("heading", { name: /^Logs/ })
    .locator("xpath=following-sibling::div[1]");
}

test.describe("Executions (detalhe)", () => {
  test("execucao com sucesso mostra header, metricas, timeline e logs @smoke", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo Detalhe Sucesso");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, TWO_NODE_GRAPH);
    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "success");

    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto(`/executions/${done.id}`);

    await expect(page.getByRole("heading", { level: 1, name: "Fluxo Detalhe Sucesso" })).toBeVisible();
    await expect(statusBadge(page, "Fluxo Detalhe Sucesso")).toContainText("Sucesso");
    await expect(metricValue(page, "Trigger")).toHaveText("manual");
    await expect(metricValue(page, "Duração")).not.toHaveText("—");

    const timeline = timelineContainer(page);
    await expect(timeline.locator("> div")).toHaveCount(2);
    await expect(timeline).toContainText("n1");
    await expect(timeline).toContainText("trigger.manual");
    await expect(timeline).toContainText("n2");
    await expect(timeline).toContainText("logic.log");
    await expect(timeline.locator("pre")).toHaveCount(4);

    await expect(logsContainer(page)).not.toContainText("Nenhum log registrado.");
    // O item da sidebar tambem se chama "Execuções" desde que os titulos de
    // pagina foram traduzidos — escopar em <main> isola o link de voltar.
    await expect(page.getByRole("main").getByRole("link", { name: "Execuções" })).toBeVisible();
  });

  test("execucao falhada mostra banner de erro e Reexecutar navega pro replay completo", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo Detalhe Falha");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, FAILING_GRAPH);
    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "failed");

    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto(`/executions/${done.id}`);

    await expect(statusBadge(page, "Fluxo Detalhe Falha")).toContainText("Falhou");
    // "Erro" tambem rotula o Output de um step falhado na timeline (mesma
    // chave de dicionario) — o banner e sempre o primeiro na ordem do DOM.
    await expect(page.getByText("Erro", { exact: true }).first()).toBeVisible();
    const diagnoseButton = page.getByRole("button", { name: "Diagnosticar com IA" });
    const retryButton = page.getByRole("button", { name: "Reexecutar" });
    await expect(diagnoseButton).toBeVisible();
    await expect(retryButton).toBeVisible();

    await retryButton.click();
    await expect(page.getByText("Nova execução enfileirada.")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/executions/(?!${done.id}$)[\\w-]+$`));

    await expect(page.getByText("Replay completo de outra execução.")).toBeVisible();
    const provenanceLink = page.getByRole("link", { name: "outra execução" });
    await expect(provenanceLink).toHaveAttribute("href", `/executions/${done.id}`);
  });

  test("replay parcial a partir de um node reaproveita o upstream e nao reaparece na timeline nova", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo Detalhe Replay");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, TWO_NODE_GRAPH);
    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "success");

    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto(`/executions/${done.id}`);

    const n2Card = timelineContainer(page).locator("> div").filter({ hasText: "n2" });
    await n2Card.getByRole("button", { name: "Replay a partir daqui" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: 'Replay a partir de "n2"' })).toBeVisible();
    await dialog.getByLabel("Input do replay (JSON)").fill('{"foo":"bar"}');
    await dialog.getByRole("button", { name: "Rodar replay" }).click();

    await expect(page.getByText("Replay parcial enfileirado.")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/executions/(?!${done.id}$)[\\w-]+$`));

    await expect(page.getByText('Replay parcial a partir de "n2" de outra execução.')).toBeVisible();
    const timeline = timelineContainer(page);
    await expect(timeline.locator("> div")).toHaveCount(1, { timeout: 15_000 });
    await expect(timeline).toContainText("n2");
    await expect(timeline).not.toContainText("n1");
  });

  test("JSON invalido no dialog de replay mostra toast e mantem o dialog aberto", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo Replay Invalido");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, TWO_NODE_GRAPH);
    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "success");

    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto(`/executions/${done.id}`);

    const n2Card = timelineContainer(page).locator("> div").filter({ hasText: "n2" });
    await n2Card.getByRole("button", { name: "Replay a partir daqui" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Input do replay (JSON)").fill("{invalido");
    await dialog.getByRole("button", { name: "Rodar replay" }).click();

    await expect(page.getByText("Input inválido: precisa ser JSON válido.")).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: 'Replay a partir de "n2"' })).toBeVisible();
  });

  test("execucao ao vivo mostra Logs (ao vivo) sem duplicatas ate concluir", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo Detalhe Ao Vivo");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, DELAY_GRAPH);
    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);

    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto(`/executions/${execution.id}`);

    await expect(page.getByRole("heading", { name: "Logs (ao vivo)" })).toBeVisible();
    await expect(statusBadge(page, "Fluxo Detalhe Ao Vivo")).toContainText(/Executando|Na fila/);

    const concludedLogLines = logsContainer(page).locator("div", { hasText: "concluido" });
    await expect(concludedLogLines).toHaveCount(1, { timeout: 15_000 });
    await expect(statusBadge(page, "Fluxo Detalhe Ao Vivo")).toContainText("Sucesso", { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Logs (ao vivo)" })).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "Logs", exact: true })).toBeVisible();
    await expect(concludedLogLines).toHaveCount(1);
  });

  test("dialog do AI Debugger abre com campos de provider/modelo e fecha com Cancelar", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo Debugger");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, FAILING_GRAPH);
    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "failed");

    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto(`/executions/${done.id}`);

    await page.getByRole("button", { name: "Diagnosticar com IA" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "AI Debugger" })).toBeVisible();
    await expect(dialog.getByLabel("Provider")).toBeVisible();
    await expect(dialog.getByLabel("Modelo")).toBeVisible();
    await expect(dialog.getByLabel("Conexão (credential)")).toBeVisible();

    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("H2-05: execucao com falha tratada (continue) mostra os dois badges e o banner de aviso", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo Falha Tratada");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, continueOnErrorGraph());
    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "success");

    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto(`/executions/${done.id}`);

    await expect(statusBadge(page, "Fluxo Falha Tratada")).toContainText("Sucesso");
    await expect(page.getByText("Falha tratada", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/pelo menos um node que falhou, mas o fluxo tratou o erro/),
    ).toBeVisible();
  });

  test("H2-05: execucao disparada por error workflow mostra o link 'disparado pelo tratamento de erro'", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);

    const handler = await createWorkflowViaApi(request, tokens, workspaceId, "Tratador Detalhe UI");
    await saveGraphViaApi(request, tokens, workspaceId, handler.id, errorHandlerGraph());
    await setWorkflowStatusViaApi(request, tokens, workspaceId, handler.id, "active");

    const origin = await createWorkflowViaApi(request, tokens, workspaceId, "Origem Detalhe UI");
    await saveGraphViaApi(request, tokens, workspaceId, origin.id, FAILING_GRAPH);
    await updateWorkflowViaApi(request, tokens, workspaceId, origin.id, { errorWorkflowId: handler.id });

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, origin.id);
    const originDone = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "failed");

    let handlerExecutionId: string | undefined;
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const list = await request.get(`${API_URL}/executions?workflowId=${handler.id}`, {
        headers: workspaceHeaders(tokens, workspaceId),
      });
      const body = await list.json();
      if (body.total > 0) {
        handlerExecutionId = body.items[0].id;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    if (!handlerExecutionId) throw new Error("Error workflow nao disparou a tempo.");
    await waitForExecutionStatus(request, tokens, workspaceId, handlerExecutionId, "success");

    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto(`/executions/${handlerExecutionId}`);

    const provenanceLink = page.getByRole("link", { name: "outra execução" });
    await expect(provenanceLink).toHaveAttribute("href", `/executions/${originDone.id}`);
    await expect(page.getByText("Disparado pelo tratamento de erro de")).toBeVisible();
  });
});
