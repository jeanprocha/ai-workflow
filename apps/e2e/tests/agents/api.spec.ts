import { test, expect } from "../../helpers/fixtures";
import type { APIRequestContext } from "@playwright/test";
import {
  API_URL,
  buildTestUser,
  registerViaApi,
  type AuthTokens,
} from "../../helpers/auth";
import { fetchWorkspaceId, workspaceHeaders } from "../../helpers/settings";
import { createAgentViaApi } from "../../helpers/agents";

/**
 * Fase 06 — Agents (API pura). Testes de UI ficam em agents.spec.ts.
 *
 * Nao precisa do worker (chat e sincrono, sem fila). Nenhum teste aqui gasta
 * token: o chat sempre para antes da chamada ao provider, seja por 404 de
 * agente, 400 de validacao ou 404 de credencial inexistente.
 */

/** Cria uma base de conhecimento (so o nome e obrigatorio) — usada nos testes de knowledgeBaseId. */
async function createKnowledgeBaseViaApi(
  request: APIRequestContext,
  tokens: AuthTokens,
  workspaceId: string,
  name: string,
): Promise<{ id: string }> {
  const response = await request.post(`${API_URL}/knowledge`, {
    headers: workspaceHeaders(tokens, workspaceId),
    data: { name },
  });
  if (!response.ok()) {
    throw new Error(`createKnowledgeBaseViaApi falhou (${response.status()})`);
  }
  return response.json() as Promise<{ id: string }>;
}

test.describe("Agents (API)", () => {
  test("POST aplica os defaults do service; lista vem desc por createdAt", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const created = await request.post(`${API_URL}/agents`, {
      headers,
      data: { name: "Agente Minimo", systemPrompt: "Seja breve.", model: "claude-sonnet-5" },
    });
    expect(created.status()).toBe(201);
    // provider/credential/temperature/tools nao foram enviados — o service
    // preenche (nao o banco).
    expect(await created.json()).toMatchObject({
      name: "Agente Minimo",
      provider: "anthropic",
      credential: "",
      temperature: 0.7,
      tools: [],
      description: null,
      knowledgeBaseId: null,
    });

    const second = await createAgentViaApi(request, tokens, workspaceId, {
      name: "Agente Recente",
    });

    const list = await request.get(`${API_URL}/agents`, { headers });
    expect(list.status()).toBe(200);
    const items = (await list.json()) as Array<{ id: string; name: string }>;
    expect(items).toHaveLength(2);
    // Mais novo primeiro.
    expect(items[0]!.id).toBe(second.id);
    expect(items[1]!.name).toBe("Agente Minimo");

    const detail = await request.get(`${API_URL}/agents/${second.id}`, { headers });
    expect(detail.status()).toBe(200);
    expect((await detail.json()).name).toBe("Agente Recente");
  });

  test("validacao do POST: obrigatorios, provider fora do enum, temperature e campo extra", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const valid = { name: "Ok", systemPrompt: "Ok.", model: "claude-sonnet-5" };

    for (const missing of ["name", "systemPrompt", "model"] as const) {
      const data: Record<string, unknown> = { ...valid };
      delete data[missing];
      const response = await request.post(`${API_URL}/agents`, { headers, data });
      expect(response.status(), `sem ${missing} deveria dar 400`).toBe(400);
    }

    // String vazia tambem falha (MinLength(1)).
    const emptyName = await request.post(`${API_URL}/agents`, {
      headers,
      data: { ...valid, name: "" },
    });
    expect(emptyName.status()).toBe(400);

    const badProvider = await request.post(`${API_URL}/agents`, {
      headers,
      data: { ...valid, provider: "deepseek" },
    });
    expect(badProvider.status()).toBe(400);

    const badTemperature = await request.post(`${API_URL}/agents`, {
      headers,
      data: { ...valid, temperature: 3 },
    });
    expect(badTemperature.status()).toBe(400);

    // forbidNonWhitelisted global.
    const extraField = await request.post(`${API_URL}/agents`, {
      headers,
      data: { ...valid, foo: "bar" },
    });
    expect(extraField.status()).toBe(400);

    // outputSchema existe no Prisma mas nao no DTO — tambem e rejeitado.
    const outputSchema = await request.post(`${API_URL}/agents`, {
      headers,
      data: { ...valid, outputSchema: {} },
    });
    expect(outputSchema.status()).toBe(400);
  });

  test("tools nao tem whitelist: tool inexistente e aceita e devolvida intacta", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    // Comportamento documentado, nao bug: o array e persistido como veio e a
    // tool desconhecida so e ignorada em runtime de chat (nunca e oferecida
    // ao LLM).
    const agent = await createAgentViaApi(request, tokens, workspaceId, {
      name: "Agente Tool Fantasma",
      tools: ["calculator", "nao_existe"],
    });
    expect(agent.tools).toEqual(["calculator", "nao_existe"]);

    const detail = await request.get(`${API_URL}/agents/${agent.id}`, { headers });
    expect((await detail.json()).tools).toEqual(["calculator", "nao_existe"]);
  });

  test("PATCH (sem UI equivalente): atualiza, aceita body vazio e 404 em id inexistente", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const agent = await createAgentViaApi(request, tokens, workspaceId, {
      name: "Nome Antigo",
      temperature: 0.2,
    });

    const patched = await request.patch(`${API_URL}/agents/${agent.id}`, {
      headers,
      data: { name: "Nome Novo", temperature: 1.5 },
    });
    expect(patched.status()).toBe(200);
    expect(await patched.json()).toMatchObject({ name: "Nome Novo", temperature: 1.5 });

    // PATCH vazio e aceito e nao muda nada.
    const noop = await request.patch(`${API_URL}/agents/${agent.id}`, { headers, data: {} });
    expect(noop.status()).toBe(200);
    expect(await noop.json()).toMatchObject({ name: "Nome Novo", temperature: 1.5 });

    const missing = await request.patch(
      `${API_URL}/agents/00000000-0000-0000-0000-000000000000`,
      { headers, data: { name: "Fantasma" } },
    );
    expect(missing.status()).toBe(404);
    expect((await missing.json()).message).toBe("Agente nao encontrado.");
  });

  test("knowledgeBaseId invalido -> 400 em pt e en (nao 500 da FK)", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const valid = { name: "Agente KB", systemPrompt: "Ok.", model: "claude-sonnet-5" };

    // Antes do fix desta fase isso estourava a FK do Prisma (P2003) e virava
    // 500 "Internal server error".
    const ghostKb = await request.post(`${API_URL}/agents`, {
      headers,
      data: { ...valid, knowledgeBaseId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(ghostKb.status()).toBe(400);
    expect((await ghostKb.json()).message).toBe(
      "Base de conhecimento nao encontrada neste workspace.",
    );

    const ghostKbEn = await request.post(`${API_URL}/agents`, {
      headers: { ...headers, "x-lang": "en" },
      data: { ...valid, knowledgeBaseId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(ghostKbEn.status()).toBe(400);
    expect((await ghostKbEn.json()).message).toBe(
      "Knowledge base not found in this workspace.",
    );

    // Base de OUTRO workspace tambem e 400 — a FK sozinha aceitaria (ela so
    // checa existencia), o filtro por workspaceId fecha o vazamento.
    const otherTokens = await registerViaApi(request, buildTestUser());
    const otherWorkspace = await fetchWorkspaceId(request, otherTokens);
    const foreignKb = await createKnowledgeBaseViaApi(
      request,
      otherTokens,
      otherWorkspace,
      "Base Alheia",
    );
    const crossWorkspace = await request.post(`${API_URL}/agents`, {
      headers,
      data: { ...valid, knowledgeBaseId: foreignKb.id },
    });
    expect(crossWorkspace.status()).toBe(400);

    // A base do proprio workspace funciona.
    const ownKb = await createKnowledgeBaseViaApi(request, tokens, workspaceId, "Base Propria");
    const accepted = await request.post(`${API_URL}/agents`, {
      headers,
      data: { ...valid, knowledgeBaseId: ownKb.id },
    });
    expect(accepted.status()).toBe(201);
    expect((await accepted.json()).knowledgeBaseId).toBe(ownKb.id);

    // O PATCH tem a mesma guarda.
    const agent = await createAgentViaApi(request, tokens, workspaceId, { name: "Agente Patch KB" });
    const patchGhost = await request.patch(`${API_URL}/agents/${agent.id}`, {
      headers,
      data: { knowledgeBaseId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(patchGhost.status()).toBe(400);
  });

  test("chat: 404 de agente (pt/en), 400 de validacao e 404 de credencial (pt/en)", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const ghostAgent = await request.post(
      `${API_URL}/agents/00000000-0000-0000-0000-000000000000/chat`,
      { headers, data: { message: "oi" } },
    );
    expect(ghostAgent.status()).toBe(404);
    expect((await ghostAgent.json()).message).toBe("Agente nao encontrado.");

    const ghostAgentEn = await request.post(
      `${API_URL}/agents/00000000-0000-0000-0000-000000000000/chat`,
      { headers: { ...headers, "x-lang": "en" }, data: { message: "oi" } },
    );
    expect(ghostAgentEn.status()).toBe(404);
    expect((await ghostAgentEn.json()).message).toBe("Agent not found.");

    const agent = await createAgentViaApi(request, tokens, workspaceId, { name: "Agente Chat" });

    const emptyMessage = await request.post(`${API_URL}/agents/${agent.id}/chat`, {
      headers,
      data: { message: "" },
    });
    expect(emptyMessage.status()).toBe(400);

    const badHistoryRole = await request.post(`${API_URL}/agents/${agent.id}/chat`, {
      headers,
      data: { message: "oi", history: [{ role: "system", content: "x" }] },
    });
    expect(badHistoryRole.status()).toBe(400);

    // Agente sem credencial: falha ANTES de qualquer chamada de rede ao
    // provider — sem custo de token.
    const noCredential = await request.post(`${API_URL}/agents/${agent.id}/chat`, {
      headers,
      data: { message: "Quanto e 2 + 2?" },
    });
    expect(noCredential.status()).toBe(404);
    expect((await noCredential.json()).message).toBe(
      'Credencial "" nao encontrada neste workspace.',
    );

    // Traducao da credencial VAZIA (o regex exigia 1+ caractere antes do fix
    // desta fase, entao esta mensagem escapava em pt mesmo com x-lang: en).
    const noCredentialEn = await request.post(`${API_URL}/agents/${agent.id}/chat`, {
      headers: { ...headers, "x-lang": "en" },
      data: { message: "Quanto e 2 + 2?" },
    });
    expect(noCredentialEn.status()).toBe(404);
    expect((await noCredentialEn.json()).message).toBe(
      'Credential "" not found in this workspace.',
    );

    // Credencial com nome preenchido mas inexistente: mesma rota, nome no meio.
    const namedAgent = await createAgentViaApi(request, tokens, workspaceId, {
      name: "Agente Credencial Fantasma",
      credential: "nao-cadastrada",
    });
    const ghostCredential = await request.post(`${API_URL}/agents/${namedAgent.id}/chat`, {
      headers,
      data: { message: "oi" },
    });
    expect(ghostCredential.status()).toBe(404);
    expect((await ghostCredential.json()).message).toBe(
      'Credencial "nao-cadastrada" nao encontrada neste workspace.',
    );
  });

  test("isolamento por workspace: agente de A da 404 pra B; lista de B vem vazia", async ({
    request,
  }) => {
    const tokensA = await registerViaApi(request, buildTestUser());
    const workspaceA = await fetchWorkspaceId(request, tokensA);
    const headersA = workspaceHeaders(tokensA, workspaceA);
    const agentA = await createAgentViaApi(request, tokensA, workspaceA, {
      name: "Agente Isolado",
    });

    const tokensB = await registerViaApi(request, buildTestUser());
    const workspaceB = await fetchWorkspaceId(request, tokensB);
    const headersB = workspaceHeaders(tokensB, workspaceB);

    // Isolamento aqui e sempre 404 (nunca 403): id inexistente e id de outro
    // workspace sao indistinguiveis de fora.
    const get = await request.get(`${API_URL}/agents/${agentA.id}`, { headers: headersB });
    expect(get.status()).toBe(404);

    const patch = await request.patch(`${API_URL}/agents/${agentA.id}`, {
      headers: headersB,
      data: { name: "Invadido" },
    });
    expect(patch.status()).toBe(404);

    const chat = await request.post(`${API_URL}/agents/${agentA.id}/chat`, {
      headers: headersB,
      data: { message: "oi" },
    });
    expect(chat.status()).toBe(404);

    const del = await request.delete(`${API_URL}/agents/${agentA.id}`, { headers: headersB });
    expect(del.status()).toBe(404);

    const listB = await request.get(`${API_URL}/agents`, { headers: headersB });
    expect(listB.status()).toBe(200);
    expect(await listB.json()).toEqual([]);

    // O agente de A segue intacto depois de tudo isso.
    const stillThere = await request.get(`${API_URL}/agents/${agentA.id}`, { headers: headersA });
    expect(stillThere.status()).toBe(200);
    expect((await stillThere.json()).name).toBe("Agente Isolado");

    // DELETE e hard delete: o proprio dono deleta e o GET seguinte da 404.
    const ownDelete = await request.delete(`${API_URL}/agents/${agentA.id}`, {
      headers: headersA,
    });
    expect(ownDelete.status()).toBe(200);
    const afterDelete = await request.get(`${API_URL}/agents/${agentA.id}`, {
      headers: headersA,
    });
    expect(afterDelete.status()).toBe(404);
  });
});
