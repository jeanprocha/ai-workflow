import { test, expect } from "../../helpers/fixtures";
import { API_URL, buildTestUser, registerViaApi } from "../../helpers/auth";
import { fetchWorkspaceId, workspaceHeaders } from "../../helpers/settings";
import {
  createWorkflowViaApi,
  saveGraphViaApi,
  runWorkflowViaApi,
  waitForExecutionStatus,
  MINIMAL_GRAPH,
  TWO_NODE_GRAPH,
} from "../../helpers/workflows";

/**
 * Fase 05 — Executions (API pura). Lista/detalhe via UI ficam em
 * list.spec.ts/detail.spec.ts; aqui so validacoes e semanticas de backend
 * que nao dependem de renderizacao.
 *
 * Precisa do worker rodando pra qualquer teste que espera "success"/"failed"
 * (waitForExecutionStatus faz polling em GET /executions/:id).
 */

test.describe("Executions (API)", () => {
  test("GET /executions: shape, ordem desc por startedAt, sem steps/logs", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo API Lista");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, MINIMAL_GRAPH);

    const first = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const second = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);

    const response = await request.get(`${API_URL}/executions?workflowId=${workflow.id}`, {
      headers,
    });
    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      items: Array<Record<string, unknown>>;
      total: number;
      page: number;
      pageSize: number;
    };
    expect(body).toMatchObject({ total: 2, page: 1, pageSize: 20 });
    expect(body.items).toHaveLength(2);
    // Mais recente (second) primeiro.
    expect(body.items[0]!.id).toBe(second.id);
    expect(body.items[1]!.id).toBe(first.id);
    expect((body.items[0]!.workflow as { name: string }).name).toBe("Fluxo API Lista");
    expect(body.items[0]!.steps).toBeUndefined();
    expect(body.items[0]!.logs).toBeUndefined();
  });

  test("GET /executions: valida pageSize>100, status invalido e page=0", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const badPageSize = await request.get(`${API_URL}/executions?pageSize=101`, { headers });
    expect(badPageSize.status()).toBe(400);

    const badStatus = await request.get(`${API_URL}/executions?status=explodiu`, { headers });
    expect(badStatus.status()).toBe(400);

    const badPage = await request.get(`${API_URL}/executions?page=0`, { headers });
    expect(badPage.status()).toBe(400);
  });

  test("GET /executions/:id: detalhe com steps/logs ordenados; 404 em pt e en pra id inexistente", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo API Detalhe");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, TWO_NODE_GRAPH);
    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "success");

    const response = await request.get(`${API_URL}/executions/${done.id}`, { headers });
    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      steps: Array<{ nodeId: string; startedAt: string }>;
      logs: unknown[];
      workflow: { name: string };
    };
    expect(body.steps.map((s) => s.nodeId)).toEqual(["n1", "n2"]);
    expect(new Date(body.steps[0]!.startedAt).getTime()).toBeLessThanOrEqual(
      new Date(body.steps[1]!.startedAt).getTime(),
    );
    expect(body.workflow.name).toBe("Fluxo API Detalhe");

    const notFound = await request.get(`${API_URL}/executions/00000000-0000-0000-0000-000000000000`, {
      headers,
    });
    expect(notFound.status()).toBe(404);
    expect((await notFound.json()).message).toBe("Execucao nao encontrada.");

    const notFoundEn = await request.get(
      `${API_URL}/executions/00000000-0000-0000-0000-000000000000`,
      { headers: { ...headers, "x-lang": "en" } },
    );
    expect(notFoundEn.status()).toBe(404);
    expect((await notFoundEn.json()).message).toBe("Execution not found.");
  });

  test("retry reaproveita o versionId original mesmo apos o fluxo ganhar uma versao nova", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo API Retry");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, MINIMAL_GRAPH);
    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const original = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "success");

    // Fluxo ganha uma versao nova DEPOIS da execucao original.
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, TWO_NODE_GRAPH);

    const retryResponse = await request.post(`${API_URL}/executions/${original.id}/retry`, {
      headers,
    });
    expect(retryResponse.ok()).toBe(true);
    const retried = (await retryResponse.json()) as {
      versionId: string;
      parentExecutionId: string;
      triggerType: string;
    };
    expect(retried.versionId).toBe(original.versionId);
    expect(retried.parentExecutionId).toBe(original.id);
    expect(retried.triggerType).toBe("manual");
  });

  test("replay total: com input usa o override, sem input herda o original", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo API Replay Total");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, MINIMAL_GRAPH);
    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id, { seed: 123 });
    const original = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "success");

    const withOverride = await request.post(`${API_URL}/executions/${original.id}/replay`, {
      headers,
      data: { input: { override: true } },
    });
    expect(withOverride.ok()).toBe(true);
    const withOverrideBody = (await withOverride.json()) as {
      inputPayload: unknown;
      parentExecutionId: string;
      replayFromNodeId: string | null;
    };
    expect(withOverrideBody.inputPayload).toEqual({ override: true });
    expect(withOverrideBody.parentExecutionId).toBe(original.id);
    expect(withOverrideBody.replayFromNodeId).toBeNull();

    const withoutInput = await request.post(`${API_URL}/executions/${original.id}/replay`, {
      headers,
      data: {},
    });
    expect(withoutInput.ok()).toBe(true);
    const withoutInputBody = (await withoutInput.json()) as { inputPayload: unknown };
    expect(withoutInputBody.inputPayload).toEqual({ seed: 123 });
  });

  test("replay parcial: 400 pra node nunca executado (pt/en) e 400 pra body com nome de campo errado", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo API Replay Parcial");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, TWO_NODE_GRAPH);
    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const original = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "success");

    const neverExecuted = await request.post(`${API_URL}/executions/${original.id}/replay`, {
      headers,
      data: { fromNodeId: "n99" },
    });
    expect(neverExecuted.status()).toBe(400);
    expect((await neverExecuted.json()).message).toBe(
      'O node "n99" nao foi executado na execucao original — nao ha o que reaproveitar.',
    );

    const neverExecutedEn = await request.post(`${API_URL}/executions/${original.id}/replay`, {
      headers: { ...headers, "x-lang": "en" },
      data: { fromNodeId: "n99" },
    });
    expect(neverExecutedEn.status()).toBe(400);
    expect((await neverExecutedEn.json()).message).toBe(
      `Node "n99" was not executed in the original run — there's nothing to reuse.`,
    );

    const wrongFieldName = await request.post(`${API_URL}/executions/${original.id}/replay`, {
      headers,
      data: { replayFromNodeId: "n2" },
    });
    expect(wrongFieldName.status()).toBe(400);
  });

  test("isolamento por workspace: execucao de A da 404 pra B em GET/retry/replay/stream; lista de B vem vazia", async ({
    request,
  }) => {
    const tokensA = await registerViaApi(request, buildTestUser());
    const workspaceA = await fetchWorkspaceId(request, tokensA);
    const workflowA = await createWorkflowViaApi(request, tokensA, workspaceA, "Fluxo Isolamento A");
    await saveGraphViaApi(request, tokensA, workspaceA, workflowA.id, MINIMAL_GRAPH);
    const executionA = await runWorkflowViaApi(request, tokensA, workspaceA, workflowA.id);
    const doneA = await waitForExecutionStatus(request, tokensA, workspaceA, executionA.id, "success");

    const tokensB = await registerViaApi(request, buildTestUser());
    const workspaceB = await fetchWorkspaceId(request, tokensB);
    const headersB = workspaceHeaders(tokensB, workspaceB);

    const getForeign = await request.get(`${API_URL}/executions/${doneA.id}`, { headers: headersB });
    expect(getForeign.status()).toBe(404);

    const retryForeign = await request.post(`${API_URL}/executions/${doneA.id}/retry`, {
      headers: headersB,
    });
    expect(retryForeign.status()).toBe(404);

    const replayForeign = await request.post(`${API_URL}/executions/${doneA.id}/replay`, {
      headers: headersB,
      data: {},
    });
    expect(replayForeign.status()).toBe(404);

    const streamForeign = await request.get(`${API_URL}/executions/${doneA.id}/stream`, {
      headers: headersB,
    });
    expect(streamForeign.status()).toBe(404);

    const listB = await request.get(`${API_URL}/executions`, { headers: headersB });
    expect(listB.status()).toBe(200);
    expect(await listB.json()).toMatchObject({ items: [], total: 0 });
  });
});
