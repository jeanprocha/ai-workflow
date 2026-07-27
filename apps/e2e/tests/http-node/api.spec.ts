import { createHmac } from "node:crypto";
import { test, expect } from "../../helpers/fixtures";
import { API_URL, buildTestUser, registerViaApi } from "../../helpers/auth";
import { fetchWorkspaceId, workspaceHeaders, createCredentialViaApi } from "../../helpers/settings";
import {
  createWorkflowViaApi,
  saveGraphViaApi,
  runWorkflowViaApi,
  waitForExecutionStatus,
  httpRequestGraph,
} from "../../helpers/workflows";

/**
 * Node HTTP white-label — $auth (Conexao)/$sig (dados da propria requisicao)/
 * assinatura HMAC, gates de seguranca e a regressao de "config legado" (grafo
 * salvo antes de query/signature/credential existirem no schema).
 *
 * Todos os testes apontam pro GET/POST /debug/echo (apps/api/src/
 * observability/debug.controller.ts) — so existe com OBS_DEBUG_ENDPOINT=1
 * (padrao em dev), devolve exatamente {method, path, query, headers, body}
 * do que recebeu. Alvo local e deterministico, sem rede externa.
 *
 * A execucao real do node HTTP roda no WORKER (apps/api/src/worker) — chamar
 * .../debug/echo (que so existe no processo da API) funciona porque os dois
 * processos ficam na mesma maquina/rede em dev.
 */

const ECHO_URL = `${API_URL}/debug/echo`;

test.describe("Node HTTP — $auth/$sig/assinatura HMAC (API)", () => {
  test("assinatura bate com o calculo manual; Timestamp do header e o mesmo assinado; query preservada", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    await createCredentialViaApi(request, tokens, workspaceId, {
      provider: "custom",
      name: "erp-assinado",
      value: JSON.stringify({
        clientId: "cid-123",
        clientSecret: "super-secreto",
        database: "novapecas",
      }),
    });
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "HTTP Assinatura HMAC");
    await saveGraphViaApi(
      request,
      tokens,
      workspaceId,
      workflow.id,
      httpRequestGraph({
        method: "GET",
        url: ECHO_URL,
        headers: {
          Token: "{{ $sig.signature }}",
          Timestamp: "{{ $sig.timestamp }}",
          Database: "{{ $auth.database }}",
          ClientId: "{{ $auth.clientId }}",
        },
        query: { termo: "parafuso", page: "1" },
        timeoutMs: 5000,
        credential: "erp-assinado",
        signature: {
          enabled: true,
          algorithm: "sha256",
          encoding: "hex",
          secret: "{{ $auth.clientSecret }}",
          template: "{{ $sig.path }}.{{ $auth.database }}.{{ $sig.timestamp }}",
          timestampOffsetSec: 300,
        },
      }),
    );

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "success");

    const detail = await (
      await request.get(`${API_URL}/executions/${done.id}`, { headers })
    ).json();
    const echoed = detail.outputPayload.body as {
      path: string;
      query: Record<string, string>;
      headers: Record<string, string>;
    };

    expect(echoed.query).toMatchObject({ termo: "parafuso", page: "1" });
    expect(echoed.headers.database).toBe("novapecas");
    expect(echoed.headers.clientid).toBe("cid-123");

    const timestamp = Number(echoed.headers.timestamp);
    const expectedSignature = createHmac("sha256", "super-secreto")
      .update(`${echoed.path}.novapecas.${timestamp}`)
      .digest("hex");
    expect(echoed.headers.token).toBe(expectedSignature);
  });

  test("credencial simples (nao-JSON) continua funcionando via {{ $auth.value }}", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    await createCredentialViaApi(request, tokens, workspaceId, {
      provider: "custom",
      name: "token-simples",
      value: "ghp_tokencru123",
    });
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "HTTP Credencial Simples");
    await saveGraphViaApi(
      request,
      tokens,
      workspaceId,
      workflow.id,
      httpRequestGraph({
        method: "GET",
        url: ECHO_URL,
        headers: { Authorization: "Bearer {{ $auth.value }}" },
        query: {},
        timeoutMs: 5000,
        credential: "token-simples",
        signature: { enabled: false },
      }),
    );

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "success");
    const detail = await (
      await request.get(`${API_URL}/executions/${done.id}`, { headers })
    ).json();
    expect(detail.outputPayload.body.headers.authorization).toBe("Bearer ghp_tokencru123");
  });

  test("PUT com corpo: campos de $auth resolvidos no corpo, materializado antes de assinar", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    await createCredentialViaApi(request, tokens, workspaceId, {
      provider: "custom",
      name: "erp-pedido",
      value: JSON.stringify({
        clientId: "cid-123",
        clientSecret: "super-secreto",
        database: "novapecas",
        filialId: 1,
        vendedorId: 33,
      }),
    });
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "HTTP Pedido Com Corpo");
    await saveGraphViaApi(
      request,
      tokens,
      workspaceId,
      workflow.id,
      httpRequestGraph({
        method: "PUT",
        url: ECHO_URL,
        headers: { "Content-Type": "application/json" },
        query: {},
        body: { FilialId: "{{ $auth.filialId }}", VendedorId: "{{ $auth.vendedorId }}", Itens: [{ IdProduto: 42, Qtd: 2 }] },
        timeoutMs: 5000,
        credential: "erp-pedido",
        signature: { enabled: false },
      }),
    );

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "success");
    const detail = await (
      await request.get(`${API_URL}/executions/${done.id}`, { headers })
    ).json();
    expect(detail.outputPayload.body.body).toEqual({
      FilialId: 1,
      VendedorId: 33,
      Itens: [{ IdProduto: 42, Qtd: 2 }],
    });
  });

  test("gate: assinatura habilitada sem segredo falha com mensagem clara, sem sair pra rede", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "HTTP Gate Sem Segredo");
    await saveGraphViaApi(
      request,
      tokens,
      workspaceId,
      workflow.id,
      httpRequestGraph({
        method: "GET",
        url: ECHO_URL,
        headers: {},
        query: {},
        timeoutMs: 5000,
        credential: "",
        signature: { enabled: true, algorithm: "sha256", encoding: "hex", secret: "", template: "" },
      }),
    );

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "failed");
    expect(done.error).toContain("Segredo");
  });

  test("gate: {{ $auth... }} referenciado sem Conexao selecionada falha explicitamente", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "HTTP Gate Sem Conexao");
    await saveGraphViaApi(
      request,
      tokens,
      workspaceId,
      workflow.id,
      httpRequestGraph({
        method: "GET",
        url: ECHO_URL,
        headers: { ClientId: "{{ $auth.clientId }}" },
        query: {},
        timeoutMs: 5000,
        credential: "",
        signature: { enabled: false },
      }),
    );

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "failed");
    expect(done.error).toContain("Conexao");
  });

  test("regressao: config legado (sem query/signature/credential no node.config) continua executando", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "HTTP Config Legado");
    // Exatamente a forma de um node.config gravado ANTES desta feature —
    // graph.schema.ts so valida node.type (nunca o shape do config de cada
    // node individualmente), entao um config "antigo" e um grafo valido.
    await saveGraphViaApi(
      request,
      tokens,
      workspaceId,
      workflow.id,
      httpRequestGraph({
        method: "GET",
        url: ECHO_URL,
        headers: { "X-Legacy": "1" },
        timeoutMs: 5000,
      }),
    );

    const execution = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, execution.id, "success");
    const detail = await (
      await request.get(`${API_URL}/executions/${done.id}`, { headers })
    ).json();
    expect(detail.outputPayload.body.headers["x-legacy"]).toBe("1");
  });
});
