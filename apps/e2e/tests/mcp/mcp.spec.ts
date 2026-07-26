import { test, expect } from "../../helpers/fixtures";
import type { Page } from "@playwright/test";
import {
  buildTestUser,
  registerViaApi,
  buildStorageState,
  authenticateContext,
} from "../../helpers/auth";
import { fetchWorkspaceId } from "../../helpers/settings";
import { connectMcpServerViaApi, fixtureServerPayload, FIXTURE_SERVER_PATH } from "../../helpers/mcp";

/**
 * Fase 08 — MCP (UI). Validacoes puras de API em api.spec.ts.
 *
 * Nao precisa do worker: connect/reconnect/disconnect/call sao todos
 * sincronos dentro do proprio request HTTP (o handshake acontece na mesma
 * chamada). O worker so entra em jogo pro health-check periodico, que nao e
 * observavel num teste curto.
 *
 * Servidor de teste: apps/e2e/fixtures/mcp-echo-server.mjs (stdio, zero
 * dependencia, tools "echo" e "soma") — a API faz o spawn, sem porta/rede.
 *
 * Armadilhas de locator mapeadas na discovery:
 * - "Conectar servidor" (header, so com lista nao-vazia; e acao do empty
 *   state) NAO colide com o submit do dialog, que e so "Conectar" — mas
 *   ambos colidem por substring, entao sempre exact:true.
 * - Titulo do dialog e "Conectar servidor MCP" (h2), escopar com
 *   page.getByRole("dialog").
 * - "Filesystem" aparece como preset E teria colidido com outros textos —
 *   escopar sempre no dialog com exact:true.
 * - Botao "Conectar" do dialog fica DISABLED com nome vazio (nao e no-op
 *   silencioso, diferente de Agents/Knowledge).
 * - connect() SEMPRE responde 201 — falha de handshake vira status "error"
 *   no servidor retornado, nunca um erro HTTP. O toast agora reflete isso
 *   (fix A4): erro real -> toast.error com o lastError.
 * - Titulo do alertdialog de remocao usa aspas tipograficas:
 *   Remover o servidor "X"? — e o botao de confirmar e "Remover", nao "Excluir".
 * - Desconectar NAO tem confirmacao — clique direto.
 * - Tools continuam visiveis no card depois de desconectar (o service nao
 *   apaga as rows).
 * - Transporte no card e o valor cru minusculo ("stdio"/"sse"/"http").
 * - useMcpServers faz polling de 15s (aqui e em /agents) — nunca esperar
 *   networkidle.
 */

/** Card do servidor pelo nome (o card e um div solto, sem wrapper flex extra). */
function serverCard(page: Page, name: string) {
  return page
    .locator("div.rounded-lg.border")
    .filter({ has: page.getByRole("heading", { level: 3, name, exact: true }) });
}

test.describe("MCP (via UI)", () => {
  test("estado vazio: convite pra conectar e sem botao no header", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/mcp");

    await expect(page.getByRole("heading", { level: 1, name: "MCP", exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Nenhum servidor MCP conectado" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Conecte um servidor Filesystem, GitHub, Postgres ou Browser para dar novas ferramentas aos seus agentes e fluxos.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Conectar servidor" })).toHaveCount(1);
  });

  test("dialog: preset preenche o form; trocar transport esconde/mostra campos; nome vazio desabilita", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/mcp");

    await page.getByRole("button", { name: "Conectar servidor" }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { level: 2, name: "Conectar servidor MCP" }),
    ).toBeVisible();

    // Nome vazio -> submit desabilitado (nao e no-op silencioso aqui).
    const submit = dialog.getByRole("button", { name: "Conectar", exact: true });
    await expect(submit).toBeDisabled();

    await dialog.getByRole("button", { name: "Filesystem", exact: true }).click();
    await expect(dialog.getByLabel("Nome")).toHaveValue("Filesystem");
    await expect(dialog.getByLabel("Comando")).toHaveValue("npx");
    await expect(dialog.getByLabel("Argumentos (um por linha)")).toHaveValue(
      "-y\n@modelcontextprotocol/server-filesystem\n/caminho/permitido",
    );
    await expect(submit).toBeEnabled();

    // Trocar pra sse esconde Comando/Argumentos/Variaveis e mostra URL.
    await dialog.getByLabel("Transport").selectOption("sse");
    await expect(dialog.getByLabel("Comando")).toHaveCount(0);
    await expect(dialog.getByLabel("Argumentos (um por linha)")).toHaveCount(0);
    await expect(dialog.getByLabel("URL")).toBeVisible();

    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("conectar a fixture pela UI: card com status Conectado, transporte e tools", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/mcp");

    await page.getByRole("button", { name: "Conectar servidor" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nome").fill("Fixture UI");
    await dialog.getByLabel("Comando").fill("node");
    await dialog.getByLabel("Argumentos (um por linha)").fill(FIXTURE_SERVER_PATH);
    await dialog.getByRole("button", { name: "Conectar", exact: true }).click();

    await expect(page.getByText("Servidor MCP conectado.")).toBeVisible();
    await expect(dialog).not.toBeVisible();

    const card = serverCard(page, "Fixture UI");
    await expect(card).toBeVisible();
    await expect(card.getByText("Conectado", { exact: true })).toBeVisible();
    await expect(card.getByText("stdio", { exact: true })).toBeVisible();
    await expect(card.getByText("echo", { exact: true })).toBeVisible();
    await expect(card.getByText("soma", { exact: true })).toBeVisible();
  });

  test("conectar servidor quebrado: card com Erro visivel e toast honesto (nao diz sucesso)", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/mcp");

    await page.getByRole("button", { name: "Conectar servidor" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nome").fill("Quebrado UI");
    await dialog.getByLabel("Comando").fill("comando-que-nao-existe-e2e");
    await dialog.getByRole("button", { name: "Conectar", exact: true }).click();

    // connect() responde 201 mesmo em falha — antes do fix A4 o toast dizia
    // "Servidor MCP conectado." aqui, o que era enganoso.
    await expect(page.getByText("Servidor MCP conectado.")).toHaveCount(0);
    await expect(page.getByText(/Nao foi possivel conectar: spawn .*ENOENT/)).toBeVisible();

    const card = serverCard(page, "Quebrado UI");
    await expect(card.getByText("Erro", { exact: true })).toBeVisible();
    await expect(card.getByText(/ENOENT/)).toBeVisible();
  });

  test("desconectar sem confirmacao: tools continuam visiveis, badge muda", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    await connectMcpServerViaApi(request, tokens, workspaceId, fixtureServerPayload("Fixture Desconectar"));
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/mcp");

    const card = serverCard(page, "Fixture Desconectar");
    await expect(card.getByText("Conectado", { exact: true })).toBeVisible();

    // aria-label = "Desconectar <nome>" (fix A1) — sem AlertDialog, acao direta.
    await page.getByLabel("Desconectar Fixture Desconectar").click();

    await expect(page.getByText("Desconectado.", { exact: true })).toBeVisible();
    await expect(card.getByText("Desconectado", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Desconectar Fixture Desconectar")).toHaveCount(0);
    // As tools NAO sao apagadas so por desconectar.
    await expect(card.getByText("echo", { exact: true })).toBeVisible();
    await expect(card.getByText("soma", { exact: true })).toBeVisible();
  });

  test("reconectar um servidor desconectado volta o status pra Conectado", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    await connectMcpServerViaApi(request, tokens, workspaceId, fixtureServerPayload("Fixture Reconectar"));
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/mcp");

    await page.getByLabel("Desconectar Fixture Reconectar").click();
    const card = serverCard(page, "Fixture Reconectar");
    await expect(card.getByText("Desconectado", { exact: true })).toBeVisible();

    // aria-label = "Reconectar <nome>" (fix A1).
    await page.getByLabel("Reconectar Fixture Reconectar").click();

    await expect(page.getByText("Reconectado.", { exact: true })).toBeVisible();
    await expect(card.getByText("Conectado", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Desconectar Fixture Reconectar")).toBeVisible();
  });

  test("remover: confirmacao cancela e depois remove de verdade", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    await connectMcpServerViaApi(request, tokens, workspaceId, fixtureServerPayload("Fixture Remover"));
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/mcp");

    // aria-label = "Remover servidor <nome>" (fix A1) — antes sem nome nenhum.
    await page.getByLabel("Remover servidor Fixture Remover").click();
    const alert = page.getByRole("alertdialog");
    await expect(
      alert.getByRole("heading", { name: "Remover o servidor “Fixture Remover”?" }),
    ).toBeVisible();
    await expect(
      alert.getByText(
        "Agentes e fluxos que usam tools deste servidor deixarao de funcionar. Esta acao nao pode ser desfeita.",
      ),
    ).toBeVisible();

    await alert.getByRole("button", { name: "Cancelar" }).click();
    await expect(alert).not.toBeVisible();
    await expect(serverCard(page, "Fixture Remover")).toBeVisible();

    await page.getByLabel("Remover servidor Fixture Remover").click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remover" }).click();

    await expect(page.getByText("Servidor removido.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nenhum servidor MCP conectado" })).toBeVisible();
  });

  test("integracao com Agents: servidor conectado habilita a secao Tools MCP", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    await connectMcpServerViaApi(request, tokens, workspaceId, fixtureServerPayload("Fixture Agents"));
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/agents");

    await page.getByRole("button", { name: "Criar agente" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Tools MCP")).toBeVisible();
    await expect(dialog.getByText("Fixture Agents")).toBeVisible();

    const echoCheckbox = dialog.getByRole("checkbox", { name: "echo", exact: true });
    await expect(echoCheckbox).toBeVisible();
    await echoCheckbox.check();

    await dialog.getByLabel("Nome").fill("Agente Com MCP");
    await dialog.getByLabel("System prompt").fill("Voce e um agente de teste com tool MCP.");
    await dialog.getByRole("button", { name: "Criar agente" }).click();

    await expect(page.getByText("Agente criado.")).toBeVisible();
    // O chip no card mostra so o nome cru da tool (mcp:<serverId>:echo -> "echo").
    const card = page
      .locator("div.rounded-lg.border")
      .filter({ has: page.getByRole("heading", { level: 3, name: "Agente Com MCP", exact: true }) });
    await expect(card.getByText("echo", { exact: true })).toBeVisible();
  });
});
