import { test, expect } from "../../helpers/fixtures";
import { API_URL, buildTestUser, registerViaApi } from "../../helpers/auth";
import { fetchWorkspaceId, workspaceHeaders } from "../../helpers/settings";
import {
  createWorkflowViaApi,
  mergePartialGraph,
  runWorkflowViaApi,
  saveGraphViaApi,
  waitForExecutionStatus,
} from "../../helpers/workflows";

/**
 * H2-05: logic.merge alimentado por um If que so roteia um dos dois lados
 * pra ele (2 edges entrantes, so 1 dispara) antes travava em silencio — a
 * onda seguinte vinha vazia, o loop terminava, e a execucao gravava
 * "success" com o merge (e tudo depois dele) nunca executado. O flush
 * parcial corrige isso: o merge roda com o array que recebeu.
 */
test.describe("logic.merge: flush parcial quando a onda esvazia", () => {
  test("@smoke If roteia so um lado pro merge: merge e o node seguinte rodam mesmo assim", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Merge parcial");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, mergePartialGraph());

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "success");
    expect(done.error).toBeNull();

    const detail = await (await request.get(`${API_URL}/executions/${done.id}`, { headers })).json();
    const stepsByNode = new Map(detail.steps.map((s: { nodeId: string }) => [s.nodeId, s]));

    // Sem o flush, nem n3 (merge) nem n4 (depois do merge) apareceriam aqui —
    // a execucao "terminaria" com sucesso logo apos o If, em silencio.
    expect(stepsByNode.has("n3")).toBe(true);
    expect((stepsByNode.get("n3") as { status: string }).status).toBe("success");
    expect((stepsByNode.get("n4") as { status: string }).status).toBe("success");
  });
});
