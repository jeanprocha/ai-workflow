import { test, expect } from "../../helpers/fixtures";
import { API_URL, buildTestUser, registerViaApi } from "../../helpers/auth";
import { fetchWorkspaceId, workspaceHeaders } from "../../helpers/settings";
import {
  createWorkflowViaApi,
  errorHandlerGraph,
  httpRequestGraph,
  runWorkflowViaApi,
  saveGraphViaApi,
  setWorkflowStatusViaApi,
  updateWorkflowViaApi,
  waitForExecutionStatus,
} from "../../helpers/workflows";

const FAILING_URL_CONFIG = {
  method: "GET",
  url: "http://127.0.0.1:9",
  headers: {},
  timeoutMs: 3000,
};

/**
 * H2-05: `Workflow.errorWorkflowId` — fluxo B disparado quando o fluxo A
 * falha, com o payload da falha no input do trigger.error.
 */
test.describe("Error workflow (Workflow.errorWorkflowId)", () => {
  test("@smoke fluxo B dispara quando A falha, com o payload certo e traceId propagado", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const handler = await createWorkflowViaApi(request, tokens, workspaceId, "Tratador de erro");
    await saveGraphViaApi(request, tokens, workspaceId, handler.id, errorHandlerGraph());
    await setWorkflowStatusViaApi(request, tokens, workspaceId, handler.id, "active");

    const origin = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo que falha");
    await saveGraphViaApi(request, tokens, workspaceId, origin.id, httpRequestGraph(FAILING_URL_CONFIG));
    const patched = await updateWorkflowViaApi(request, tokens, workspaceId, origin.id, {
      errorWorkflowId: handler.id,
    });
    expect(patched.status).toBe(200);
    expect(patched.body.errorWorkflowId).toBe(handler.id);

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, origin.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "failed");

    let handlerExecution: { id: string; triggerType: string; parentExecutionId: string | null; traceId: string | null } | undefined;
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const list = await (
        await request.get(`${API_URL}/executions?workflowId=${handler.id}`, { headers })
      ).json();
      if (list.total > 0) {
        handlerExecution = list.items[0];
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    expect(handlerExecution).toBeDefined();
    expect(handlerExecution!.triggerType).toBe("event");
    expect(handlerExecution!.parentExecutionId).toBe(done.id);
    expect(handlerExecution!.traceId).toBe(done.traceId ?? done.id);

    const handlerDone = await waitForExecutionStatus(
      request,
      tokens,
      workspaceId,
      handlerExecution!.id,
      "success",
    );
    const handlerDetail = await (
      await request.get(`${API_URL}/executions/${handlerDone.id}`, { headers })
    ).json();
    expect(handlerDetail.inputPayload).toMatchObject({
      workflowId: origin.id,
      workflowName: "Fluxo que falha",
      executionId: done.id,
      failedNodeId: "n2",
      triggerType: "manual",
    });
    expect(typeof handlerDetail.inputPayload.error).toBe("string");
    expect(typeof handlerDetail.inputPayload.timestamp).toBe("string");
  });

  test("anti-recursao: um tratador que TAMBEM falha (mesmo apontando de volta pro fluxo original) nao gera uma 3a execucao", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const origin = await createWorkflowViaApi(request, tokens, workspaceId, "Origem do ciclo");
    await saveGraphViaApi(request, tokens, workspaceId, origin.id, httpRequestGraph(FAILING_URL_CONFIG));

    // Tratador que TAMBEM falha (trigger.error -> httpRequest quebrado).
    const handler = await createWorkflowViaApi(request, tokens, workspaceId, "Tratador que falha");
    await saveGraphViaApi(request, tokens, workspaceId, handler.id, {
      nodes: [
        {
          id: "n1",
          type: "trigger.error",
          category: "trigger",
          label: "Error Trigger",
          position: { x: 0, y: 0 },
          config: {},
        },
        {
          id: "n2",
          type: "api.httpRequest",
          category: "api",
          label: "HTTP Request",
          position: { x: 320, y: 0 },
          config: FAILING_URL_CONFIG,
        },
      ],
      edges: [{ id: "e1", source: "n1", target: "n2" }],
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    await setWorkflowStatusViaApi(request, tokens, workspaceId, handler.id, "active");

    // Ciclo configurado de proposito: origin -> handler -> origin. Se a
    // guarda de recursao falhar, isso vira um loop sem fim.
    await updateWorkflowViaApi(request, tokens, workspaceId, origin.id, { errorWorkflowId: handler.id });
    await updateWorkflowViaApi(request, tokens, workspaceId, handler.id, { errorWorkflowId: origin.id });

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, origin.id);
    await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "failed");

    let handlerExecutionId: string | undefined;
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const list = await (
        await request.get(`${API_URL}/executions?workflowId=${handler.id}`, { headers })
      ).json();
      if (list.total > 0) {
        handlerExecutionId = list.items[0].id;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    expect(handlerExecutionId).toBeDefined();
    await waitForExecutionStatus(request, tokens, workspaceId, handlerExecutionId!, "failed");

    // Da tempo pro dispatch (se a guarda falhasse) acontecer antes de contar.
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const originList = await (
      await request.get(`${API_URL}/executions?workflowId=${origin.id}`, { headers })
    ).json();
    const handlerList = await (
      await request.get(`${API_URL}/executions?workflowId=${handler.id}`, { headers })
    ).json();
    expect(originList.total).toBe(1);
    expect(handlerList.total).toBe(1);
  });

  test("400: um fluxo nao pode apontar pra si mesmo como error workflow", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Auto-referencia");

    const result = await updateWorkflowViaApi(request, tokens, workspaceId, workflow.id, {
      errorWorkflowId: workflow.id,
    });

    expect(result.status).toBe(400);
  });

  test("404: fluxo de tratamento de erro precisa existir no mesmo workspace", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Tratador inexistente");

    const result = await updateWorkflowViaApi(request, tokens, workspaceId, workflow.id, {
      errorWorkflowId: "00000000-0000-0000-0000-000000000000",
    });

    expect(result.status).toBe(404);
  });

  test("errorWorkflowId: null limpa o ponteiro sem exigir validacao", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const handler = await createWorkflowViaApi(request, tokens, workspaceId, "Tratador");
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo com tratador");

    await updateWorkflowViaApi(request, tokens, workspaceId, workflow.id, {
      errorWorkflowId: handler.id,
    });
    const cleared = await updateWorkflowViaApi(request, tokens, workspaceId, workflow.id, {
      errorWorkflowId: null,
    });

    expect(cleared.status).toBe(200);
    expect(cleared.body.errorWorkflowId).toBeNull();
  });
});
