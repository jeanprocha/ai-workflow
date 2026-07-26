import { test, expect } from "../../helpers/fixtures";
import { API_URL, buildTestUser, registerViaApi } from "../../helpers/auth";
import { fetchWorkspaceId, workspaceHeaders } from "../../helpers/settings";
import {
  connectMcpServerViaApi,
  fixtureServerPayload,
  brokenServerPayload,
  type McpServerSummary,
} from "../../helpers/mcp";

/**
 * Fase 08 — MCP (API pura). Testes de UI ficam em mcp.spec.ts.
 *
 * Nao precisa do worker: connect/reconnect/disconnect/call sao sincronos
 * dentro do proprio request. O health-check periodico (fila mcp-health, fix
 * A3 desta fase) so roda a cada 60s no worker — tempo demais pra um teste;
 * comportamento documentado no roteiro manual em vez de automatizado aqui.
 */

test.describe("MCP (API)", () => {
  test("connect na fixture: 201 connected com as duas tools; lista vem desc por createdAt", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const response = await request.post(`${API_URL}/mcp/servers`, {
      headers,
      data: fixtureServerPayload("Fixture API"),
    });
    expect(response.status()).toBe(201);
    const server = (await response.json()) as McpServerSummary;
    expect(server.status).toBe("connected");
    expect(server.lastError).toBeNull();
    expect(server.tools.map((t) => t.name).sort()).toEqual(["echo", "soma"]);
    const echo = server.tools.find((t) => t.name === "echo")!;
    expect(echo.description).toBe("Devolve o texto recebido.");
    expect(echo.inputSchema).toMatchObject({ type: "object", required: ["text"] });

    const second = await connectMcpServerViaApi(request, tokens, workspaceId, fixtureServerPayload("Fixture API 2"));

    const list = await request.get(`${API_URL}/mcp/servers`, { headers });
    expect(list.status()).toBe(200);
    const items = (await list.json()) as McpServerSummary[];
    expect(items).toHaveLength(2);
    expect(items[0]!.id).toBe(second.id);
  });

  test("connect com erro de handshake: 201 + status error, nunca 500", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const enoent = await request.post(`${API_URL}/mcp/servers`, {
      headers,
      data: brokenServerPayload("Comando Fantasma"),
    });
    expect(enoent.status()).toBe(201);
    const enoentBody = (await enoent.json()) as McpServerSummary;
    expect(enoentBody.status).toBe("error");
    expect(enoentBody.lastError).toContain("ENOENT");
    expect(enoentBody.tools).toEqual([]);

    const deadPort = await request.post(`${API_URL}/mcp/servers`, {
      headers,
      data: { name: "Porta Morta", transport: "http", url: "http://127.0.0.1:1/mcp" },
    });
    expect(deadPort.status()).toBe(201);
    expect((await deadPort.json()).status).toBe("error");
    expect((await deadPort.json()).lastError).toBe("fetch failed");

    // Documenta a ausencia de @IsUrl no DTO: string qualquer passa a
    // validacao e so falha no new URL() dentro do handshake.
    const badUrl = await request.post(`${API_URL}/mcp/servers`, {
      headers,
      data: { name: "URL Invalida", transport: "http", url: "nao-e-url" },
    });
    expect(badUrl.status()).toBe(201);
    expect((await badUrl.json()).status).toBe("error");
    expect((await badUrl.json()).lastError).toBe("Invalid URL");
  });

  test("validacao do POST /mcp/servers", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const noName = await request.post(`${API_URL}/mcp/servers`, {
      headers,
      data: { transport: "stdio", command: "node" },
    });
    expect(noName.status()).toBe(400);

    const badTransport = await request.post(`${API_URL}/mcp/servers`, {
      headers,
      data: { name: "X", transport: "websocket" },
    });
    expect(badTransport.status()).toBe(400);
    expect((await badTransport.json()).message).toContain(
      "transport must be one of the following values: stdio, sse, http",
    );

    const stdioNoCommand = await request.post(`${API_URL}/mcp/servers`, {
      headers,
      data: { name: "X", transport: "stdio" },
    });
    expect(stdioNoCommand.status()).toBe(400);

    const sseNoUrl = await request.post(`${API_URL}/mcp/servers`, {
      headers,
      data: { name: "X", transport: "sse" },
    });
    expect(sseNoUrl.status()).toBe(400);

    const extraField = await request.post(`${API_URL}/mcp/servers`, {
      headers,
      data: { name: "X", transport: "stdio", command: "node", foo: "bar" },
    });
    expect(extraField.status()).toBe(400);
  });

  test("callTool feliz: echo e soma respondem certo", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const server = await connectMcpServerViaApi(
      request,
      tokens,
      workspaceId,
      fixtureServerPayload("Fixture Call"),
    );

    const echo = await request.post(`${API_URL}/mcp/servers/${server.id}/call`, {
      headers,
      data: { toolName: "echo", args: { text: "ola" } },
    });
    expect(echo.status()).toBe(201);
    expect(await echo.json()).toMatchObject({ content: [{ type: "text", text: "ola" }] });

    const soma = await request.post(`${API_URL}/mcp/servers/${server.id}/call`, {
      headers,
      data: { toolName: "soma", args: { a: 4, b: 5 } },
    });
    expect(soma.status()).toBe(201);
    expect(await soma.json()).toMatchObject({ content: [{ type: "text", text: "9" }] });
  });

  test("callTool: validacoes do DTO e 404 de tool inexistente (pt/en)", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const server = await connectMcpServerViaApi(
      request,
      tokens,
      workspaceId,
      fixtureServerPayload("Fixture Validacao"),
    );

    const emptyTool = await request.post(`${API_URL}/mcp/servers/${server.id}/call`, {
      headers,
      data: { toolName: "" },
    });
    expect(emptyTool.status()).toBe(400);

    const badArgs = await request.post(`${API_URL}/mcp/servers/${server.id}/call`, {
      headers,
      data: { toolName: "echo", args: "nao-e-objeto" },
    });
    expect(badArgs.status()).toBe(400);

    // Antes do fix A2 isso caia no McpError generico do SDK -> 500.
    const unknownTool = await request.post(`${API_URL}/mcp/servers/${server.id}/call`, {
      headers,
      data: { toolName: "nao-existe" },
    });
    expect(unknownTool.status()).toBe(404);
    expect((await unknownTool.json()).message).toBe(
      'Tool "nao-existe" nao encontrada neste servidor MCP.',
    );

    const unknownToolEn = await request.post(`${API_URL}/mcp/servers/${server.id}/call`, {
      headers: { ...headers, "x-lang": "en" },
      data: { toolName: "nao-existe" },
    });
    expect(unknownToolEn.status()).toBe(404);
    expect((await unknownToolEn.json()).message).toBe('Tool "nao-existe" not found on this MCP server.');
  });

  test("callTool em servidor quebrado: 400 em pt e en (nao 500 generico)", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const server = await connectMcpServerViaApi(
      request,
      tokens,
      workspaceId,
      brokenServerPayload("Quebrado Call"),
    );
    expect(server.status).toBe("error");

    const call = await request.post(`${API_URL}/mcp/servers/${server.id}/call`, {
      headers,
      data: { toolName: "qualquer-coisa" },
    });
    expect(call.status()).toBe(400);
    expect((await call.json()).message).toBe("Nao foi possivel conectar ao servidor MCP.");

    const callEn = await request.post(`${API_URL}/mcp/servers/${server.id}/call`, {
      headers: { ...headers, "x-lang": "en" },
      data: { toolName: "qualquer-coisa" },
    });
    expect(callEn.status()).toBe(400);
    expect((await callEn.json()).message).toBe("Could not connect to the MCP server.");
  });

  test("disconnect preserva as tools e nao impede reconexao lazy; reconnect explicito volta connected", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const server = await connectMcpServerViaApi(
      request,
      tokens,
      workspaceId,
      fixtureServerPayload("Fixture Ciclo"),
    );

    const disconnect = await request.post(`${API_URL}/mcp/servers/${server.id}/disconnect`, {
      headers,
    });
    expect(disconnect.status()).toBe(201);

    const afterDisconnect = await request.get(`${API_URL}/mcp/servers`, { headers });
    const disconnectedServer = ((await afterDisconnect.json()) as McpServerSummary[]).find(
      (s) => s.id === server.id,
    )!;
    expect(disconnectedServer.status).toBe("disconnected");
    // Tools NAO sao apagadas so por desconectar.
    expect(disconnectedServer.tools.map((t) => t.name).sort()).toEqual(["echo", "soma"]);

    // callTool num servidor "disconnected" reconecta sozinho (ensureConnected).
    const callAfterDisconnect = await request.post(`${API_URL}/mcp/servers/${server.id}/call`, {
      headers,
      data: { toolName: "echo", args: { text: "reconectou" } },
    });
    expect(callAfterDisconnect.status()).toBe(201);
    expect(await callAfterDisconnect.json()).toMatchObject({
      content: [{ type: "text", text: "reconectou" }],
    });

    const listAfterLazy = await request.get(`${API_URL}/mcp/servers`, { headers });
    const lazyServer = ((await listAfterLazy.json()) as McpServerSummary[]).find((s) => s.id === server.id)!;
    expect(lazyServer.status).toBe("connected");

    const reconnect = await request.post(`${API_URL}/mcp/servers/${server.id}/reconnect`, { headers });
    expect(reconnect.status()).toBe(201);
    expect((await reconnect.json()).status).toBe("connected");
  });

  test("isolamento por workspace: servidor de A da 404 pra B; DELETE e idempotente-negativo", async ({
    request,
  }) => {
    const tokensA = await registerViaApi(request, buildTestUser());
    const workspaceA = await fetchWorkspaceId(request, tokensA);
    const headersA = workspaceHeaders(tokensA, workspaceA);
    const serverA = await connectMcpServerViaApi(
      request,
      tokensA,
      workspaceA,
      fixtureServerPayload("Fixture Isolamento A"),
    );

    const tokensB = await registerViaApi(request, buildTestUser());
    const workspaceB = await fetchWorkspaceId(request, tokensB);
    const headersB = workspaceHeaders(tokensB, workspaceB);

    const reconnectForeign = await request.post(
      `${API_URL}/mcp/servers/${serverA.id}/reconnect`,
      { headers: headersB },
    );
    expect(reconnectForeign.status()).toBe(404);
    expect((await reconnectForeign.json()).message).toBe("Servidor MCP nao encontrado.");

    const disconnectForeign = await request.post(
      `${API_URL}/mcp/servers/${serverA.id}/disconnect`,
      { headers: headersB },
    );
    expect(disconnectForeign.status()).toBe(404);

    const callForeign = await request.post(`${API_URL}/mcp/servers/${serverA.id}/call`, {
      headers: headersB,
      data: { toolName: "echo", args: {} },
    });
    expect(callForeign.status()).toBe(404);

    const removeForeign = await request.delete(`${API_URL}/mcp/servers/${serverA.id}`, {
      headers: headersB,
    });
    expect(removeForeign.status()).toBe(404);

    const listB = await request.get(`${API_URL}/mcp/servers`, { headers: headersB });
    expect(listB.status()).toBe(200);
    expect(await listB.json()).toEqual([]);

    // O dono remove de verdade: 200, e o segundo DELETE da 404.
    const ownDelete = await request.delete(`${API_URL}/mcp/servers/${serverA.id}`, {
      headers: headersA,
    });
    expect(ownDelete.status()).toBe(200);

    const secondDelete = await request.delete(`${API_URL}/mcp/servers/${serverA.id}`, {
      headers: headersA,
    });
    expect(secondDelete.status()).toBe(404);
  });
});
