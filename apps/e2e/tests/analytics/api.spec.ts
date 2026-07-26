import { test, expect } from "../../helpers/fixtures";
import { API_URL, buildTestUser, registerViaApi } from "../../helpers/auth";
import { fetchWorkspaceId, workspaceHeaders } from "../../helpers/settings";
import {
  createWorkflowViaApi,
  saveGraphViaApi,
  runWorkflowViaApi,
  waitForExecutionStatus,
  MINIMAL_GRAPH,
  FAILING_GRAPH,
} from "../../helpers/workflows";

/**
 * Fase 09 — Analytics + Cost Optimizer (API pura). Testes de UI ficam em
 * dashboard.spec.ts/analytics.spec.ts/cost-optimizer.spec.ts.
 *
 * Mesma armadilha do cache Redis dos specs de UI: sempre semear antes de ler.
 * Como cada teste registra um workspace novo, a primeira leitura de cada
 * endpoint aqui e sempre um cache-miss genuino.
 */

test.describe("Analytics (API)", () => {
  test("summary: zerado num workspace novo; reflete execucoes apos semear", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const wfOk = await createWorkflowViaApi(request, tokens, workspaceId, "API Summary OK");
    await saveGraphViaApi(request, tokens, workspaceId, wfOk.id, MINIMAL_GRAPH);
    const execOk = await runWorkflowViaApi(request, tokens, workspaceId, wfOk.id);
    await waitForExecutionStatus(request, tokens, workspaceId, execOk.id, "success");

    const wfFail = await createWorkflowViaApi(request, tokens, workspaceId, "API Summary Falha");
    await saveGraphViaApi(request, tokens, workspaceId, wfFail.id, FAILING_GRAPH);
    const execFail = await runWorkflowViaApi(request, tokens, workspaceId, wfFail.id);
    await waitForExecutionStatus(request, tokens, workspaceId, execFail.id, "failed");

    const response = await request.get(`${API_URL}/analytics/summary`, { headers });
    expect(response.status()).toBe(200);
    const summary = await response.json();
    expect(summary.workflowsCount).toBe(2);
    expect(summary.executionsCount).toBe(2);
    expect(summary.failuresCount).toBe(1);
    expect(summary.failureRate).toBeCloseTo(0.5, 5);
    expect(summary.avgDurationMs).toBeGreaterThan(0);
    expect(summary.aiRequestsCount).toBe(0);
    expect(summary.tokensTotal).toBe(0);
    expect(summary.costUsdTotal).toBe(0);
  });

  test("timeseries: default 14 dias, valores malformados caem no default, dias gigante nao da mais 500 (valida fix A3)", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "API Timeseries");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, MINIMAL_GRAPH);
    const exec = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    await waitForExecutionStatus(request, tokens, workspaceId, exec.id, "success");

    const noParam = await request.get(`${API_URL}/analytics/timeseries`, { headers });
    expect(noParam.status()).toBe(200);
    const noParamBody = await noParam.json();
    expect(noParamBody).toHaveLength(1);
    expect(noParamBody[0]).toMatchObject({ executions: 1, failures: 0 });
    expect(noParamBody[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    for (const bad of ["abc", "0", "-5"]) {
      const response = await request.get(`${API_URL}/analytics/timeseries?days=${bad}`, { headers });
      expect(response.status(), `days=${bad} deveria ser 200`).toBe(200);
      expect((await response.json())[0]).toMatchObject({ executions: 1 });
    }

    // Antes do fix A3 isso estourava "interval field value out of range" do
    // Postgres (erro nao-HttpException) -> 500 generico.
    const huge = await request.get(`${API_URL}/analytics/timeseries?days=999999999999`, { headers });
    expect(huge.status()).toBe(200);
    expect((await huge.json())[0]).toMatchObject({ executions: 1 });

    const extraParam = await request.get(`${API_URL}/analytics/timeseries?days=7&foo=bar`, {
      headers,
    });
    expect(extraParam.status()).toBe(200);
  });

  test("recent-executions: ordem desc, take 5, inclui workflow.name, sem steps/logs", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "API Recent");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, MINIMAL_GRAPH);
    const first = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    await waitForExecutionStatus(request, tokens, workspaceId, first.id, "success");
    const second = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    await waitForExecutionStatus(request, tokens, workspaceId, second.id, "success");

    const response = await request.get(`${API_URL}/analytics/recent-executions`, { headers });
    expect(response.status()).toBe(200);
    const items = await response.json();
    expect(items.length).toBeLessThanOrEqual(5);
    expect(items[0].id).toBe(second.id);
    expect(items[0].workflow).toMatchObject({ name: "API Recent" });
    expect(items[0].steps).toBeUndefined();
    expect(items[0].logs).toBeUndefined();
  });

  test("cost-by-provider: array vazio sem steps de IA", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "API Cost Provider");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, MINIMAL_GRAPH);
    const exec = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    await waitForExecutionStatus(request, tokens, workspaceId, exec.id, "success");

    const response = await request.get(`${API_URL}/analytics/cost-by-provider`, { headers });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  test("isolamento por workspace: dados de A nao aparecem pro summary/timeseries de B", async ({
    request,
  }) => {
    const tokensA = await registerViaApi(request, buildTestUser());
    const workspaceA = await fetchWorkspaceId(request, tokensA);
    const workflow = await createWorkflowViaApi(request, tokensA, workspaceA, "API Isolamento A");
    await saveGraphViaApi(request, tokensA, workspaceA, workflow.id, MINIMAL_GRAPH);
    const exec = await runWorkflowViaApi(request, tokensA, workspaceA, workflow.id);
    await waitForExecutionStatus(request, tokensA, workspaceA, exec.id, "success");

    const tokensB = await registerViaApi(request, buildTestUser());
    const workspaceB = await fetchWorkspaceId(request, tokensB);
    const headersB = workspaceHeaders(tokensB, workspaceB);

    const summaryB = await request.get(`${API_URL}/analytics/summary`, { headers: headersB });
    expect(summaryB.status()).toBe(200);
    expect((await summaryB.json()).executionsCount).toBe(0);

    const timeseriesB = await request.get(`${API_URL}/analytics/timeseries`, { headers: headersB });
    expect(await timeseriesB.json()).toEqual([]);

    const recentB = await request.get(`${API_URL}/analytics/recent-executions`, {
      headers: headersB,
    });
    expect(await recentB.json()).toEqual([]);
  });

  test("guards: sem x-workspace-id -> 400; workspace alheio -> 403", async ({ request }) => {
    const tokensA = await registerViaApi(request, buildTestUser());
    const workspaceA = await fetchWorkspaceId(request, tokensA);
    const tokensB = await registerViaApi(request, buildTestUser());

    const noHeader = await request.get(`${API_URL}/analytics/summary`, {
      headers: { Authorization: `Bearer ${tokensA.accessToken}` },
    });
    expect(noHeader.status()).toBe(400);
    expect((await noHeader.json()).message).toBe("Header x-workspace-id e obrigatorio.");

    const foreign = await request.get(`${API_URL}/analytics/summary`, {
      headers: workspaceHeaders(tokensB, workspaceA),
    });
    expect(foreign.status()).toBe(403);
    expect((await foreign.json()).message).toBe("Voce nao tem acesso a este workspace.");
  });
});

test.describe("Cost Optimizer (API)", () => {
  test("analyze: [] num workspace novo e com workflowId fantasma (200, nao 404)", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const empty = await request.get(`${API_URL}/cost-optimizer/analyze`, { headers });
    expect(empty.status()).toBe(200);
    expect(await empty.json()).toEqual([]);

    const ghostWorkflow = await request.get(
      `${API_URL}/cost-optimizer/analyze?workflowId=00000000-0000-0000-0000-000000000000`,
      { headers },
    );
    expect(ghostWorkflow.status()).toBe(200);
    expect(await ghostWorkflow.json()).toEqual([]);
  });

  test("apply: sugestao fantasma -> 404 em pt e en", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const response = await request.post(
      `${API_URL}/cost-optimizer/00000000-0000-0000-0000-000000000000/apply`,
      { headers },
    );
    expect(response.status()).toBe(404);
    expect((await response.json()).message).toBe("Sugestao nao encontrada.");

    const responseEn = await request.post(
      `${API_URL}/cost-optimizer/00000000-0000-0000-0000-000000000000/apply`,
      { headers: { ...headers, "x-lang": "en" } },
    );
    expect(responseEn.status()).toBe(404);
    expect((await responseEn.json()).message).toBe("Suggestion not found.");
  });
});
