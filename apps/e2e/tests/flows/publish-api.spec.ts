import { test, expect } from "../../helpers/fixtures";
import { API_URL, buildTestUser, registerViaApi } from "../../helpers/auth";
import { fetchWorkspaceId, workspaceHeaders } from "../../helpers/settings";
import {
  createWorkflowViaApi,
  saveGraphViaApi,
  setWorkflowStatusViaApi,
  webhookGraph,
} from "../../helpers/workflows";
import {
  createFlowApiKeyViaApi,
  getFlowApiExecution,
  invokeFlowApi,
  listFlowApiKeysViaApi,
  revokeFlowApiKeyViaApi,
  webhookRespondFanOutGraph,
  webhookRespondGraph,
} from "../../helpers/flow-api";

/**
 * H2-04 — publicar fluxo como API. O mecanismo de espera sincrona e polling
 * do banco (nao pub/sub, ver execution-waiter.ts); estes testes exercitam o
 * endpoint publico de ponta a ponta contra o worker de verdade.
 */
test.describe("Publicar fluxo como API (v1/flows)", () => {
  test("@smoke invoke sincrono: 200 com o output do api.respond na mesma chamada", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);

    const workflow = await createWorkflowViaApi(
      request,
      tokens,
      workspaceId,
      "Publicar API - sincrono",
    );
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, webhookRespondGraph());
    await setWorkflowStatusViaApi(request, tokens, workspaceId, workflow.id, "active");

    const created = await createFlowApiKeyViaApi(request, tokens, workspaceId, workflow.id);
    expect(created.key).toMatch(/^wfk_/);

    const result = await invokeFlowApi(request, workflow.id, created.key, {
      pergunta: "qual o preco do produto X?",
    });

    expect(result.status).toBe(200);
    expect(result.body.status).toBe("success");
    expect(result.body.output).toEqual({ pergunta: "qual o preco do produto X?" });
  });

  test("fan-out: o output publicado e o do api.respond, nao o do ramo paralelo", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);

    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Publicar API - fan-out");
    await saveGraphViaApi(
      request,
      tokens,
      workspaceId,
      workflow.id,
      webhookRespondFanOutGraph(),
    );
    await setWorkflowStatusViaApi(request, tokens, workspaceId, workflow.id, "active");
    const created = await createFlowApiKeyViaApi(request, tokens, workspaceId, workflow.id);

    const result = await invokeFlowApi(request, workflow.id, created.key, { ping: "pong" });

    expect(result.status).toBe(200);
    // Sem hasRespondOutput, o lastOutput da onda podia vir do node de log
    // ("branch-nao-deveria-vencer") em vez do api.respond — este e o teste
    // que prova que isso nao acontece.
    expect(result.body.output).toEqual({ ping: "pong" });
  });

  test("modo assincrono (?mode=async): 202 com resultUrl, GET converge para success", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);

    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Publicar API - async");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, webhookRespondGraph());
    await setWorkflowStatusViaApi(request, tokens, workspaceId, workflow.id, "active");
    const created = await createFlowApiKeyViaApi(request, tokens, workspaceId, workflow.id);

    const accepted = await invokeFlowApi(
      request,
      workflow.id,
      created.key,
      { x: 1 },
      { mode: "async" },
    );
    expect(accepted.status).toBe(202);
    expect(accepted.body.status).toBe("queued");
    expect(accepted.body.resultUrl).toBe(
      `/v1/flows/${workflow.id}/executions/${accepted.body.executionId}`,
    );

    const deadline = Date.now() + 15_000;
    let last = accepted;
    while (Date.now() < deadline) {
      last = await getFlowApiExecution(
        request,
        workflow.id,
        accepted.body.executionId,
        created.key,
      );
      if (last.body.status !== "queued" && last.body.status !== "running") break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    expect(last.status).toBe(200);
    expect(last.body.status).toBe("success");
    expect(last.body.output).toEqual({ x: 1 });
  });

  test("401: chave ausente, invalida, revogada, ou de outro fluxo", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);

    const workflowA = await createWorkflowViaApi(request, tokens, workspaceId, "Publicar API - 401 A");
    await saveGraphViaApi(request, tokens, workspaceId, workflowA.id, webhookRespondGraph());
    await setWorkflowStatusViaApi(request, tokens, workspaceId, workflowA.id, "active");
    const keyA = await createFlowApiKeyViaApi(request, tokens, workspaceId, workflowA.id);

    const workflowB = await createWorkflowViaApi(request, tokens, workspaceId, "Publicar API - 401 B");
    await saveGraphViaApi(request, tokens, workspaceId, workflowB.id, webhookRespondGraph());
    await setWorkflowStatusViaApi(request, tokens, workspaceId, workflowB.id, "active");

    const noHeader = await invokeFlowApi(request, workflowA.id, "", {});
    expect(noHeader.status).toBe(401);

    const garbage = await invokeFlowApi(request, workflowA.id, "wfk_lixo-total", {});
    expect(garbage.status).toBe(401);

    const crossWorkflow = await invokeFlowApi(request, workflowB.id, keyA.key, {});
    expect(crossWorkflow.status).toBe(401);

    await revokeFlowApiKeyViaApi(request, tokens, workspaceId, workflowA.id, keyA.id);
    const revoked = await invokeFlowApi(request, workflowA.id, keyA.key, {});
    expect(revoked.status).toBe(401);
  });

  test("404: GET de uma execucao que pertence a outro fluxo", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);

    const workflowA = await createWorkflowViaApi(request, tokens, workspaceId, "Publicar API - 404 A");
    await saveGraphViaApi(request, tokens, workspaceId, workflowA.id, webhookRespondGraph());
    await setWorkflowStatusViaApi(request, tokens, workspaceId, workflowA.id, "active");
    const keyA = await createFlowApiKeyViaApi(request, tokens, workspaceId, workflowA.id);
    const executionA = await invokeFlowApi(request, workflowA.id, keyA.key, {});
    expect(executionA.status).toBe(200);

    const workflowB = await createWorkflowViaApi(request, tokens, workspaceId, "Publicar API - 404 B");
    await saveGraphViaApi(request, tokens, workspaceId, workflowB.id, webhookRespondGraph());
    await setWorkflowStatusViaApi(request, tokens, workspaceId, workflowB.id, "active");
    const keyB = await createFlowApiKeyViaApi(request, tokens, workspaceId, workflowB.id);

    const crossGet = await getFlowApiExecution(
      request,
      workflowB.id,
      executionA.body.executionId,
      keyB.key,
    );
    expect(crossGet.status).toBe(404);
  });

  test("409: fluxo em draft ou archived rejeita o invoke", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);

    const draft = await createWorkflowViaApi(request, tokens, workspaceId, "Publicar API - draft");
    await saveGraphViaApi(request, tokens, workspaceId, draft.id, webhookRespondGraph());
    const draftKey = await createFlowApiKeyViaApi(request, tokens, workspaceId, draft.id);
    const draftResult = await invokeFlowApi(request, draft.id, draftKey.key, {});
    expect(draftResult.status).toBe(409);

    await setWorkflowStatusViaApi(request, tokens, workspaceId, draft.id, "active");
    await setWorkflowStatusViaApi(request, tokens, workspaceId, draft.id, "archived");
    const archivedResult = await invokeFlowApi(request, draft.id, draftKey.key, {});
    expect(archivedResult.status).toBe(409);
  });

  test("429: excede o limite por chave (60/min) enquanto o ThrottlerGuard global (300/min) nao interfere", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);

    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Publicar API - 429");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, webhookRespondGraph());
    await setWorkflowStatusViaApi(request, tokens, workspaceId, workflow.id, "active");
    const created = await createFlowApiKeyViaApi(request, tokens, workspaceId, workflow.id);

    // mode=async: so enfileira, sem esperar a engine — o teste teria que
    // esperar 60 execucoes completas em modo sincrono, lento e desnecessario
    // pra provar so o contador do rate limit.
    let lastStatus = 0;
    for (let i = 0; i < 61; i++) {
      const result = await invokeFlowApi(
        request,
        workflow.id,
        created.key,
        {},
        { mode: "async" },
      );
      lastStatus = result.status;
      if (i < 60) expect(result.status).toBe(202);
    }
    expect(lastStatus).toBe(429);
  });

  test("nao-regressao: POST /hooks/:webhookId continua funcionando sem chave", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);

    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Nao regressao webhook");
    const saved = await saveGraphViaApi(request, tokens, workspaceId, workflow.id, webhookGraph());
    await setWorkflowStatusViaApi(request, tokens, workspaceId, workflow.id, "active");

    const response = await request.post(`${API_URL}/hooks/${saved.webhookId}`, { data: {} });
    expect(response.status()).toBe(201);
  });

  test("listagem de chaves nunca traz o valor bruto nem o hash", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);

    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Publicar API - listagem");
    await createFlowApiKeyViaApi(request, tokens, workspaceId, workflow.id, "chave 1");
    await createFlowApiKeyViaApi(request, tokens, workspaceId, workflow.id, "chave 2");

    const list = await listFlowApiKeysViaApi(request, tokens, workspaceId, workflow.id);
    expect(list).toHaveLength(2);
    for (const key of list) {
      expect(key).not.toHaveProperty("key");
      expect(key).not.toHaveProperty("keyHash");
      expect(key.lastFour).toMatch(/^[0-9a-f]{4}$/);
    }
  });
});
