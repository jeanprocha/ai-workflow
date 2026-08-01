import { test, expect } from "../../helpers/fixtures";
import { API_URL, buildTestUser, registerViaApi } from "../../helpers/auth";
import { fetchWorkspaceId, workspaceHeaders } from "../../helpers/settings";
import {
  continueOnErrorFanOutGraph,
  continueOnErrorGraph,
  createWorkflowViaApi,
  runWorkflowViaApi,
  saveGraphViaApi,
  waitForExecutionStatus,
} from "../../helpers/workflows";

/**
 * onError:'continue' (H2-05) — falha vira `{ error }` e segue pelo caminho
 * normal, sem exigir uma edge "error" dedicada (diferente de onError:'branch',
 * ja coberto em error-branch.spec.ts).
 */
test.describe("Continue-on-error (onError: continue)", () => {
  test("@smoke falha vira {error} e o caminho normal continua; execucao termina success", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Continue on error");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, continueOnErrorGraph());

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "success");
    expect(done.error).toBeNull();

    const detail = await (await request.get(`${API_URL}/executions/${done.id}`, { headers })).json();
    const stepsByNode = new Map(detail.steps.map((s: { nodeId: string }) => [s.nodeId, s]));

    // O node que falhou continua gravado como failed (observabilidade) — so
    // a EXECUCAO nao falha.
    expect((stepsByNode.get("n2") as { status: string }).status).toBe("failed");
    const logStep = stepsByNode.get("n3") as { status: string; output: unknown };
    expect(logStep.status).toBe("success");
    expect(logStep.output).toContain("erro capturado:");
  });

  test("fan-out: so a edge SEM handle roteia; a edge com handle nunca dispara", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Continue on error - fan-out");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, continueOnErrorFanOutGraph());

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "success");

    const detail = await (await request.get(`${API_URL}/executions/${done.id}`, { headers })).json();
    const stepsByNode = new Map(detail.steps.map((s: { nodeId: string }) => [s.nodeId, s]));

    expect((stepsByNode.get("n3") as { status: string }).status).toBe("success");
    expect(stepsByNode.has("n4")).toBe(false);
  });
});
