import { test, expect } from "../../helpers/fixtures";
import { API_URL, buildTestUser, registerViaApi, uniqueEmail } from "../../helpers/auth";
import { fetchWorkspaceId, workspaceHeaders } from "../../helpers/settings";
import {
  createWorkflowViaApi,
  saveGraphViaApi,
  runWorkflowViaApi,
  waitForExecutionStatus,
  retryExecutionViaApi,
  replayExecutionViaApi,
  setWorkflowStatusViaApi,
} from "../../helpers/workflows";
import { waitForApprovalToken } from "../../helpers/mailpit";
import {
  createSmtpCredentialViaApi,
  approvalGraph,
  approvalParallelMergeGraph,
  getApprovalStatus,
  decideApprovalByToken,
} from "../../helpers/approvals";
import {
  createFlowApiKeyViaApi,
  invokeFlowApi,
} from "../../helpers/flow-api";

/**
 * H2-06 — aprovacao humana (pausa duravel). Cobre o contrato ponta a ponta:
 * node approval.human suspende -> execution vira waiting_approval -> e-mail
 * chega no Mailpit -> decisao via /approve/:token -> execucao retoma e
 * conclui pelo branch correto.
 *
 * Fora de escopo aqui: timeout aplicado pelo sweeper. O node so aceita
 * timeoutHours >= 1 (config schema), entao nao ha como produzir uma
 * Approval vencida dentro de um teste em tempo real sem um backdoor de
 * teste pro banco — e algo que este repo nao tem hoje. A logica do sweeper
 * (ApprovalsSweepProcessor + ApprovalsService.applyTimeout, guard de
 * expiracao invertido em relacao a decideByToken/decideById) ja e coberta
 * por unit tests (apps/api/src/approvals/approvals.service.spec.ts).
 */

async function setupApprovalWorkflow(
  request: import("@playwright/test").APIRequestContext,
  name: string,
  graphOptions: { onTimeout?: "approve" | "reject" } = {},
) {
  const tokens = await registerViaApi(request, buildTestUser());
  const workspaceId = await fetchWorkspaceId(request, tokens);
  const credential = await createSmtpCredentialViaApi(request, tokens, workspaceId);
  const recipient = uniqueEmail("aprovador");
  const workflow = await createWorkflowViaApi(request, tokens, workspaceId, name);
  await saveGraphViaApi(
    request,
    tokens,
    workspaceId,
    workflow.id,
    approvalGraph({
      credential: credential.name,
      recipients: recipient,
      onTimeout: graphOptions.onTimeout,
    }),
  );
  return { tokens, workspaceId, credential, recipient, workflow };
}

test.describe("Aprovacao humana (H2-06)", () => {
  test("@smoke aprovar: execucao pausa, e-mail chega, decisao retoma e conclui pelo branch 'approved'", async ({
    request,
  }) => {
    const { tokens, workspaceId, recipient, workflow } = await setupApprovalWorkflow(
      request,
      "Aprovacao - Feliz",
    );

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const paused = await waitForExecutionStatus(
      request,
      tokens,
      workspaceId,
      execution.id,
      "waiting_approval",
    );
    expect(paused.status).toBe("waiting_approval");

    const token = await waitForApprovalToken(request, recipient);
    const status = await getApprovalStatus(request, token);
    expect(status.status).toBe(200);
    expect(status.body.decidedAt).toBeNull();

    const decide = await decideApprovalByToken(request, token, "approved", "pode mandar");
    expect(decide.status).toBe(200);

    const done = await waitForExecutionStatus(
      request,
      tokens,
      workspaceId,
      execution.id,
      "success",
    );
    const headers = workspaceHeaders(tokens, workspaceId);
    const detail = await (
      await request.get(`${API_URL}/executions/${done.id}`, { headers })
    ).json();
    const stepsByNode = new Map(
      detail.steps.map((s: { nodeId: string }) => [s.nodeId, s]),
    );
    // n3 (branch "approved") rodou; n4 (branch "rejected") nunca rodou.
    expect(stepsByNode.has("n3")).toBe(true);
    expect(stepsByNode.has("n4")).toBe(false);
    // O node suspenso grava DOIS steps pro mesmo nodeId: a 1a passada
    // (waiting_approval, "aguardando") e a retomada (success, com a decisao).
    const n2Steps = detail.steps.filter(
      (s: { nodeId: string }) => s.nodeId === "n2",
    );
    expect(n2Steps.map((s: { status: string }) => s.status).sort()).toEqual(
      ["success", "waiting_approval"],
    );

    // Depois de decidida, o link para de "pendente" — GET reflete o estado final.
    const decidedStatus = await getApprovalStatus(request, token);
    expect(decidedStatus.body.decision).toBe("approved");
    expect(decidedStatus.body.comment).toBe("pode mandar");
  });

  test("rejeitar: retoma pelo branch 'rejected'", async ({ request }) => {
    const { tokens, workspaceId, recipient, workflow } = await setupApprovalWorkflow(
      request,
      "Aprovacao - Rejeitar",
    );

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "waiting_approval");

    const token = await waitForApprovalToken(request, recipient);
    const decide = await decideApprovalByToken(request, token, "rejected");
    expect(decide.status).toBe(200);

    const done = await waitForExecutionStatus(
      request,
      tokens,
      workspaceId,
      execution.id,
      "success",
    );
    const headers = workspaceHeaders(tokens, workspaceId);
    const detail = await (
      await request.get(`${API_URL}/executions/${done.id}`, { headers })
    ).json();
    const stepsByNode = new Map(
      detail.steps.map((s: { nodeId: string }) => [s.nodeId, s]),
    );
    expect(stepsByNode.has("n4")).toBe(true);
    expect(stepsByNode.has("n3")).toBe(false);
  });

  test("duas decisoes simultaneas pro mesmo token: uma vence (200), a outra perde a corrida (409)", async ({
    request,
  }) => {
    const { tokens, workspaceId, recipient, workflow } = await setupApprovalWorkflow(
      request,
      "Aprovacao - Corrida",
    );

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "waiting_approval");
    const token = await waitForApprovalToken(request, recipient);

    const [first, second] = await Promise.all([
      decideApprovalByToken(request, token, "approved"),
      decideApprovalByToken(request, token, "rejected"),
    ]);

    const statuses = [first.status, second.status].sort();
    // Consumo atomico (updateMany + count check, ApprovalsService.consumeDecision):
    // exatamente uma das duas chamadas grava a decisao.
    expect(statuses).toEqual([200, 409]);
  });

  test("retry de execucao waiting_approval: 409, nao cria uma nova execucao", async ({
    request,
  }) => {
    const { tokens, workspaceId, workflow } = await setupApprovalWorkflow(
      request,
      "Aprovacao - Retry bloqueado",
    );

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "waiting_approval");

    const retry = await retryExecutionViaApi(request, tokens, workspaceId, execution.id);
    expect(retry.status).toBe(409);
  });

  test("replay de execucao waiting_approval: 409", async ({ request }) => {
    const { tokens, workspaceId, workflow } = await setupApprovalWorkflow(
      request,
      "Aprovacao - Replay bloqueado",
    );

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "waiting_approval");

    const replay = await replayExecutionViaApi(request, tokens, workspaceId, execution.id);
    expect(replay.status).toBe(409);
  });

  test("Parallel -> Merge com um lado suspenso: nao termina success com a aprovacao pendente (regressao do guard do flush)", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const credential = await createSmtpCredentialViaApi(request, tokens, workspaceId);
    const recipient = uniqueEmail("aprovador-parallel");
    const workflow = await createWorkflowViaApi(
      request,
      tokens,
      workspaceId,
      "Aprovacao - Parallel+Merge",
    );
    await saveGraphViaApi(
      request,
      tokens,
      workspaceId,
      workflow.id,
      approvalParallelMergeGraph({ credential: credential.name, recipients: recipient }),
    );

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    // Sem o guard `suspendedAll.size === 0` no flush de merge, esta chamada
    // encontraria "success" (o merge tendo rodado so com o lado B) em vez de
    // "waiting_approval" — e o teste falharia aqui.
    const paused = await waitForExecutionStatus(
      request,
      tokens,
      workspaceId,
      execution.id,
      "waiting_approval",
    );
    expect(paused.status).toBe("waiting_approval");

    const headers = workspaceHeaders(tokens, workspaceId);
    const midDetail = await (
      await request.get(`${API_URL}/executions/${execution.id}`, { headers })
    ).json();
    const midStepsByNode = new Map(
      midDetail.steps.map((s: { nodeId: string }) => [s.nodeId, s]),
    );
    // O lado B (logic.log) ja rodou — "drenar-e-pausar": irmaos da mesma
    // onda completam normalmente antes da execucao pausar.
    expect(midStepsByNode.has("n4")).toBe(true);
    // O Merge (e tudo depois dele) NUNCA rodou com a aprovacao pendente.
    expect(midStepsByNode.has("n5")).toBe(false);
    expect(midStepsByNode.has("n6")).toBe(false);

    const token = await waitForApprovalToken(request, recipient);
    const decide = await decideApprovalByToken(request, token, "approved");
    expect(decide.status).toBe(200);

    const done = await waitForExecutionStatus(
      request,
      tokens,
      workspaceId,
      execution.id,
      "success",
    );
    const detail = await (
      await request.get(`${API_URL}/executions/${done.id}`, { headers })
    ).json();
    const stepsByNode = new Map(
      detail.steps.map((s: { nodeId: string }) => [s.nodeId, s]),
    );
    // Agora sim: o merge completou (recebeu os dois lados) e o node final rodou.
    expect(stepsByNode.has("n5")).toBe(true);
    expect(stepsByNode.has("n6")).toBe(true);
  });

  test("H2-04: invoke sincrono publicado numa execucao que pausa devolve 202 + resultUrl, nunca 200 com output:null", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const credential = await createSmtpCredentialViaApi(request, tokens, workspaceId);
    const recipient = uniqueEmail("aprovador-flowapi");
    const workflow = await createWorkflowViaApi(
      request,
      tokens,
      workspaceId,
      "Aprovacao - Flow API",
    );
    await saveGraphViaApi(
      request,
      tokens,
      workspaceId,
      workflow.id,
      approvalGraph({ credential: credential.name, recipients: recipient }),
    );
    await setWorkflowStatusViaApi(request, tokens, workspaceId, workflow.id, "active");
    const apiKey = await createFlowApiKeyViaApi(request, tokens, workspaceId, workflow.id);

    // O invoke sincrono espera ate este prazo e degrada pra 202 se a
    // execucao ainda nao chegou a status terminal — como waiting_approval
    // nunca "termina" sozinho, isto sempre estoura o timeout e cai no
    // caminho 202 (o que o teste esta verificando). 15s (bem generoso): o
    // Mailpit deste ambiente de dev leva ~10s so pra mandar o "220" inicial
    // da conexao SMTP (reverse-DNS no connect, medido isoladamente com um
    // socket raw — nada a ver com o node ou com nodemailer), soma com o
    // overhead normal do node+fila.
    const invoke = await invokeFlowApi(request, workflow.id, apiKey.key, {}, { timeoutMs: 25_000 });

    expect(invoke.status).toBe(202);
    expect(invoke.body.status).toBe("waiting_approval");
    expect(invoke.body.resultUrl).toBeTruthy();
    // Regressao do bug H2-04 encontrado no discovery do H2-06: antes desta
    // correcao, PENDING_STATUSES (controller) e TERMINAL_STATUSES (waiter)
    // eram allowlists desacopladas e um status novo caia no vao, devolvendo
    // 200 com output:null pra uma execucao so pausada.
    expect(invoke.body.output).toBeNull();

    // Limpeza: decide pra nao deixar a execucao presa em waiting_approval
    // (nao e estritamente necessario pro teste, mas evita ruido no /approvals
    // de quem rodar a suite localmente e for conferir manualmente).
    const token = await waitForApprovalToken(request, recipient);
    await decideApprovalByToken(request, token, "rejected");
  });
});
