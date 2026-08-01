import { test, expect } from "../../helpers/fixtures";
import { API_URL, buildTestUser, registerViaApi } from "../../helpers/auth";
import { fetchWorkspaceId, workspaceHeaders } from "../../helpers/settings";
import {
  createWorkflowViaApi,
  saveGraphViaApi,
  runWorkflowViaApi,
  waitForExecutionStatus,
  codeGraph,
} from "../../helpers/workflows";

/**
 * H2-03 — node logic.code (JS num contexto vm isolado). Cobre o isolamento
 * de verdade (worker real, nao o spec mockado de node-sandbox-runner.ts):
 * $vars/console/timeout end-to-end, e a sonda de vazamento de env/globals.
 * Precisa do worker no ar (`pnpm --filter @workflow/api dev:worker`).
 */
test.describe("logic.code", () => {
  test("@smoke feliz: transforma $input, escreve $vars (visivel no node seguinte) e loga no console", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Codigo - Feliz");
    await saveGraphViaApi(
      request,
      tokens,
      workspaceId,
      workflow.id,
      codeGraph({
        code: "console.log('processando', $input.n); $vars.dobro = $input.n * 2; return { dobro: $vars.dobro };",
      }),
    );

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id, {
      n: 21,
    });
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "success");
    const detail = await (await request.get(`${API_URL}/executions/${done.id}`, { headers })).json();

    const stepsByNode = new Map(
      detail.steps.map((s: { nodeId: string }) => [s.nodeId, s]),
    );
    const codeStep = stepsByNode.get("n2") as {
      status: string;
      output: unknown;
      varsPatch: unknown;
    };
    expect(codeStep.status).toBe("success");
    expect(codeStep.output).toEqual({ dobro: 42 });
    expect(codeStep.varsPatch).toEqual({ dobro: 42 });

    // $vars escrito pelo code node ja mesclado quando o log seguinte roda.
    const logStep = stepsByNode.get("n3") as { output: unknown };
    expect(logStep.output).toBe("dobro=42");

    // Primeiro assert do repo em logs[] — console.log do usuario vira
    // ExecutionLog{event:"code.console"}.
    const consoleLog = (detail.logs as Array<{ nodeId: string; event: string; payload: unknown }>).find(
      (l) => l.nodeId === "n2" && l.event === "code.console",
    );
    expect(consoleLog?.payload).toEqual({ text: "processando 21" });
  });

  test("loop sincrono infinito: falha por timeout com mensagem clara; API continua saudavel", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Codigo - Timeout");
    await saveGraphViaApi(
      request,
      tokens,
      workspaceId,
      workflow.id,
      codeGraph({ code: "while (true) {}", timeoutMs: 1000 }),
    );

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "failed");
    expect(done.error).toContain("excedeu o timeout de 1000ms");

    // O terminate() do vm/sandbox nao derrubou o processo da API.
    const health = await request.get(`${API_URL}/health/live`);
    expect(health.ok()).toBe(true);
  });

  test("sonda de vazamento: process/require/fetch nao existem dentro do codigo", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Codigo - Sonda");
    await saveGraphViaApi(
      request,
      tokens,
      workspaceId,
      workflow.id,
      codeGraph({
        code: "return { p: typeof process, r: typeof require, f: typeof fetch };",
      }),
    );

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "success");
    const detail = await (await request.get(`${API_URL}/executions/${done.id}`, { headers })).json();

    const codeStep = detail.steps.find((s: { nodeId: string }) => s.nodeId === "n2");
    expect(codeStep.output).toEqual({ p: "undefined", r: "undefined", f: "undefined" });
  });
});
