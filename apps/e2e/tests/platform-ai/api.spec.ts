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
 * Fase 10 — IA de plataforma (API pura, caminhos determinísticos SEM custo
 * de token). Fases anteriores já cobriram os dialogs rasos; aqui cobrimos os
 * 26 caminhos de erro/validação mapeados na discovery — validações do DTO,
 * 404 de recurso/credencial/sugestão, guards. O caminho feliz de cada
 * feature (que exige LLM real) fica em platform-ai.spec.ts, marcado @ai.
 *
 * Nao precisa do worker pras rotas de IA em si (sao sincronas), mas o setup
 * de alguns testes (execucao failed pro Debugger) usa MINIMAL_GRAPH/
 * FAILING_GRAPH + waitForExecutionStatus, que precisam do worker rodando.
 */

const GHOST_ID = "00000000-0000-0000-0000-000000000000";

test.describe("Autocomplete (API)", () => {
  test("validacoes do DTO: prompt curto, provider invalido, campo extra", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const valid = { prompt: "Gerar um fluxo simples", provider: "anthropic", model: "claude-sonnet-5" };

    const shortPrompt = await request.post(`${API_URL}/autocomplete/generate`, {
      headers,
      data: { ...valid, prompt: "ab" },
    });
    expect(shortPrompt.status()).toBe(400);

    const badProvider = await request.post(`${API_URL}/autocomplete/generate`, {
      headers,
      data: { ...valid, provider: "cohere" },
    });
    expect(badProvider.status()).toBe(400);

    const extraField = await request.post(`${API_URL}/autocomplete/generate`, {
      headers,
      data: { ...valid, foo: "bar" },
    });
    expect(extraField.status()).toBe(400);
  });

  test("workflowId fantasma -> 404 ANTES da checagem de credencial", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    // Sem credencial NENHUMA no body — se a ordem fosse invertida, isso
    // daria 400 de credencial em vez do 404 de fluxo.
    const response = await request.post(`${API_URL}/autocomplete/generate`, {
      headers,
      data: { prompt: "Gerar um fluxo simples", provider: "anthropic", model: "claude-sonnet-5", workflowId: GHOST_ID },
    });
    expect(response.status()).toBe(404);
    expect((await response.json()).message).toBe("Fluxo nao encontrado.");

    const responseEn = await request.post(`${API_URL}/autocomplete/generate`, {
      headers: { ...headers, "x-lang": "en" },
      data: { prompt: "Gerar um fluxo simples", provider: "anthropic", model: "claude-sonnet-5", workflowId: GHOST_ID },
    });
    expect(responseEn.status()).toBe(404);
    expect((await responseEn.json()).message).toBe("Flow not found.");
  });

  test("cadeia de credencial: sem credencial -> 400; credencial fantasma -> 404", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const valid = { prompt: "Gerar um fluxo simples", provider: "anthropic", model: "claude-sonnet-5" };

    const noCredential = await request.post(`${API_URL}/autocomplete/generate`, {
      headers,
      data: valid,
    });
    expect(noCredential.status()).toBe(400);
    expect((await noCredential.json()).message).toBe("Informe a credencial do provider de IA.");

    const noCredentialEn = await request.post(`${API_URL}/autocomplete/generate`, {
      headers: { ...headers, "x-lang": "en" },
      data: valid,
    });
    expect(noCredentialEn.status()).toBe(400);
    expect((await noCredentialEn.json()).message).toBe("Provide the AI provider credential.");

    const ghostCredential = await request.post(`${API_URL}/autocomplete/generate`, {
      headers,
      data: { ...valid, credential: "nao-cadastrada" },
    });
    expect(ghostCredential.status()).toBe(404);
    expect((await ghostCredential.json()).message).toBe(
      'Credencial "nao-cadastrada" nao encontrada neste workspace.',
    );

    const ghostCredentialEn = await request.post(`${API_URL}/autocomplete/generate`, {
      headers: { ...headers, "x-lang": "en" },
      data: { ...valid, credential: "nao-cadastrada" },
    });
    expect(ghostCredentialEn.status()).toBe(404);
    expect((await ghostCredentialEn.json()).message).toBe(
      'Credential "nao-cadastrada" not found in this workspace.',
    );
  });
});

test.describe("Copilot (API)", () => {
  test("chat: workflow fantasma -> 404; validacoes do DTO", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const ghostWorkflow = await request.post(`${API_URL}/workflows/${GHOST_ID}/copilot/chat`, {
      headers,
      data: { message: "oi", provider: "anthropic", model: "claude-sonnet-5" },
    });
    expect(ghostWorkflow.status()).toBe(404);
    expect((await ghostWorkflow.json()).message).toBe("Fluxo nao encontrado.");

    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Copilot API");

    const emptyMessage = await request.post(`${API_URL}/workflows/${workflow.id}/copilot/chat`, {
      headers,
      data: { message: "", provider: "anthropic", model: "claude-sonnet-5" },
    });
    expect(emptyMessage.status()).toBe(400);

    const badHistoryRole = await request.post(`${API_URL}/workflows/${workflow.id}/copilot/chat`, {
      headers,
      data: {
        message: "oi",
        provider: "anthropic",
        model: "claude-sonnet-5",
        history: [{ role: "system", content: "x" }],
      },
    });
    expect(badHistoryRole.status()).toBe(400);
  });

  test("chat: cadeia de credencial (sem credencial -> 400; fantasma -> 404)", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Copilot API Credencial");

    const noCredential = await request.post(`${API_URL}/workflows/${workflow.id}/copilot/chat`, {
      headers,
      data: { message: "oi", provider: "anthropic", model: "claude-sonnet-5" },
    });
    expect(noCredential.status()).toBe(400);
    expect((await noCredential.json()).message).toBe("Informe a credencial do provider de IA.");

    const ghostCredential = await request.post(`${API_URL}/workflows/${workflow.id}/copilot/chat`, {
      headers,
      data: {
        message: "oi",
        provider: "anthropic",
        model: "claude-sonnet-5",
        credential: "nao-cadastrada",
      },
    });
    expect(ghostCredential.status()).toBe(404);
    expect((await ghostCredential.json()).message).toBe(
      'Credencial "nao-cadastrada" nao encontrada neste workspace.',
    );
  });

  test("apply: suggestionId fantasma -> 404 (o :id do workflow na URL e ignorado)", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Copilot API Apply");

    const response = await request.post(
      `${API_URL}/workflows/${workflow.id}/copilot/suggestions/${GHOST_ID}/apply`,
      { headers },
    );
    expect(response.status()).toBe(404);
    expect((await response.json()).message).toBe("Sugestao nao encontrada.");

    // Mesmo suggestionId fantasma, workflow na URL tambem fantasma — o
    // resultado e IDENTICO, confirmando que o :id da URL nunca e usado.
    const responseGhostWorkflow = await request.post(
      `${API_URL}/workflows/${GHOST_ID}/copilot/suggestions/${GHOST_ID}/apply`,
      { headers },
    );
    expect(responseGhostWorkflow.status()).toBe(404);
    expect((await responseGhostWorkflow.json()).message).toBe("Sugestao nao encontrada.");
  });
});

test.describe("AI Debugger (API)", () => {
  test("diagnose: execucao fantasma -> 404; execucao com sucesso -> 400 (nao pode diagnosticar)", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const ghostExecution = await request.post(`${API_URL}/executions/${GHOST_ID}/diagnose`, {
      headers,
      data: { provider: "anthropic", model: "claude-sonnet-5" },
    });
    expect(ghostExecution.status()).toBe(404);
    expect((await ghostExecution.json()).message).toBe("Execucao nao encontrada.");

    const ghostExecutionEn = await request.post(`${API_URL}/executions/${GHOST_ID}/diagnose`, {
      headers: { ...headers, "x-lang": "en" },
      data: { provider: "anthropic", model: "claude-sonnet-5" },
    });
    expect(ghostExecutionEn.status()).toBe(404);
    expect((await ghostExecutionEn.json()).message).toBe("Execution not found.");

    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Debugger API Sucesso");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, MINIMAL_GRAPH);
    const exec = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, exec.id, "success");

    const successDiagnose = await request.post(`${API_URL}/executions/${done.id}/diagnose`, {
      headers,
      data: { provider: "anthropic", model: "claude-sonnet-5" },
    });
    expect(successDiagnose.status()).toBe(400);
    expect((await successDiagnose.json()).message).toBe(
      "So e possivel diagnosticar execucoes que falharam.",
    );

    const successDiagnoseEn = await request.post(`${API_URL}/executions/${done.id}/diagnose`, {
      headers: { ...headers, "x-lang": "en" },
      data: { provider: "anthropic", model: "claude-sonnet-5" },
    });
    expect(successDiagnoseEn.status()).toBe(400);
    expect((await successDiagnoseEn.json()).message).toBe(
      "Only failed executions can be diagnosed.",
    );
  });

  test("diagnose: execucao failed + cadeia de credencial (sem -> 400; fantasma -> 404)", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Debugger API Falha");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, FAILING_GRAPH);
    const exec = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    const done = await waitForExecutionStatus(request, tokens, workspaceId, exec.id, "failed");

    const noCredential = await request.post(`${API_URL}/executions/${done.id}/diagnose`, {
      headers,
      data: { provider: "anthropic", model: "claude-sonnet-5" },
    });
    expect(noCredential.status()).toBe(400);
    expect((await noCredential.json()).message).toBe("Informe a credencial do provider de IA.");

    const ghostCredential = await request.post(`${API_URL}/executions/${done.id}/diagnose`, {
      headers,
      data: { provider: "anthropic", model: "claude-sonnet-5", credential: "nao-cadastrada" },
    });
    expect(ghostCredential.status()).toBe(404);
    expect((await ghostCredential.json()).message).toBe(
      'Credencial "nao-cadastrada" nao encontrada neste workspace.',
    );

    const badProvider = await request.post(`${API_URL}/executions/${done.id}/diagnose`, {
      headers,
      data: { provider: "cohere", model: "claude-sonnet-5" },
    });
    expect(badProvider.status()).toBe(400);

    const noModel = await request.post(`${API_URL}/executions/${done.id}/diagnose`, {
      headers,
      data: { provider: "anthropic" },
    });
    expect(noModel.status()).toBe(400);
  });

  test("apply: sugestao fantasma -> 404; body invalido -> 400", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const ghostSuggestion = await request.post(`${API_URL}/executions/diagnose/${GHOST_ID}/apply`, {
      headers,
      data: { suggestionIndex: 0 },
    });
    expect(ghostSuggestion.status()).toBe(404);
    expect((await ghostSuggestion.json()).message).toBe("Sugestao nao encontrada.");

    const emptyBody = await request.post(`${API_URL}/executions/diagnose/${GHOST_ID}/apply`, {
      headers,
      data: {},
    });
    expect(emptyBody.status()).toBe(400);

    const negativeIndex = await request.post(`${API_URL}/executions/diagnose/${GHOST_ID}/apply`, {
      headers,
      data: { suggestionIndex: -1 },
    });
    expect(negativeIndex.status()).toBe(400);

    const stringIndex = await request.post(`${API_URL}/executions/diagnose/${GHOST_ID}/apply`, {
      headers,
      data: { suggestionIndex: "0" },
    });
    expect(stringIndex.status()).toBe(400);
  });
});

test.describe("AI Suggestions (API-only)", () => {
  test("GET lista vazia num workspace novo; resolve fantasma -> 404; status invalido -> 400", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const list = await request.get(`${API_URL}/ai-suggestions`, { headers });
    expect(list.status()).toBe(200);
    expect(await list.json()).toEqual([]);

    const ghostResolve = await request.post(`${API_URL}/ai-suggestions/${GHOST_ID}/resolve`, {
      headers,
      data: { status: "accepted" },
    });
    expect(ghostResolve.status()).toBe(404);
    expect((await ghostResolve.json()).message).toBe("Sugestao nao encontrada.");

    const badStatus = await request.post(`${API_URL}/ai-suggestions/${GHOST_ID}/resolve`, {
      headers,
      data: { status: "invalido" },
    });
    expect(badStatus.status()).toBe(400);
  });
});

test.describe("Guards das rotas de IA", () => {
  test("sem x-workspace-id -> 400; workspace alheio -> 403", async ({ request }) => {
    const tokensA = await registerViaApi(request, buildTestUser());
    const workspaceA = await fetchWorkspaceId(request, tokensA);
    const tokensB = await registerViaApi(request, buildTestUser());

    const noHeader = await request.post(`${API_URL}/autocomplete/generate`, {
      headers: { Authorization: `Bearer ${tokensA.accessToken}` },
      data: { prompt: "Gerar um fluxo simples", provider: "anthropic", model: "claude-sonnet-5" },
    });
    expect(noHeader.status()).toBe(400);
    expect((await noHeader.json()).message).toBe("Header x-workspace-id e obrigatorio.");

    const foreign = await request.get(`${API_URL}/ai-suggestions`, {
      headers: workspaceHeaders(tokensB, workspaceA),
    });
    expect(foreign.status()).toBe(403);
    expect((await foreign.json()).message).toBe("Voce nao tem acesso a este workspace.");
  });
});
