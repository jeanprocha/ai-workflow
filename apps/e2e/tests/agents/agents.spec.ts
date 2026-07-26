import { test, expect } from "../../helpers/fixtures";
import type { Page } from "@playwright/test";
import {
  buildTestUser,
  registerViaApi,
  buildStorageState,
  authenticateContext,
} from "../../helpers/auth";
import {
  createCredentialViaApi,
  fetchWorkspaceId,
} from "../../helpers/settings";
import { createAgentViaApi } from "../../helpers/agents";

/**
 * Fase 06 — Agents (UI). Validacoes puras de API em api.spec.ts.
 *
 * Nao precisa do worker: o chat do agente e sincrono dentro do request HTTP
 * (sem fila, sem SSE), diferente de executions.
 *
 * Armadilhas de locator mapeadas na discovery:
 * - "Criar agente" aparece 4x: botao do header, acao do empty state, titulo do
 *   dialog e submit do dialog — sempre escopar com page.getByRole("dialog") e
 *   usar getByRole("heading") pro titulo.
 * - O botao "Criar agente" do header SO existe com a lista nao-vazia; com
 *   lista vazia o unico ponto de entrada e a acao do empty state.
 * - O h1 da pagina e "Agents" (em ingles mesmo em pt); o link do sidebar e
 *   "Agentes".
 * - O titulo do alertdialog de exclusao usa aspas tipograficas:
 *   Excluir o agente “X”?
 * - Os chips de tools no card mostram a CHAVE crua (calculator, http, sql,
 *   knowledge_base, memory), nao o label do formulario ("Internet (HTTP)").
 * - Submit com Nome/System prompt vazios e no-op silencioso (guard
 *   client-side, sem toast) — a unica assercao e o dialog continuar aberto.
 * - useMcpServers faz polling de 15s enquanto a pagina vive — nunca esperar
 *   networkidle aqui.
 * - O "X" de fechar do dialog tem nome acessivel "Close" (hardcoded no
 *   componente compartilhado); "Fechar" e o botao do footer do dialog de teste.
 * - Nao existe UI de edicao (PATCH /agents/:id e API-only) nem tela de
 *   memoria — a memoria e so o checkbox que grava memory_get + memory_set.
 */

/** Card do grid pelo nome do agente (o grid nao e tabela — sao divs). */
function agentCard(page: Page, name: string) {
  return page
    .locator("div.rounded-lg.border")
    .filter({ has: page.getByRole("heading", { level: 3, name, exact: true }) });
}

test.describe("Agents (via UI)", () => {
  test("estado vazio: convite pra criar e sem botao no header", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/agents");

    await expect(page.getByRole("heading", { level: 1, name: "Agents" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nenhum agente ainda" })).toBeVisible();
    await expect(
      page.getByText("Crie um agente com ferramentas e memoria para reutilizar em qualquer fluxo."),
    ).toBeVisible();
    // Com a lista vazia existe UM unico "Criar agente" na tela (o do empty
    // state) — o do header so aparece quando ja ha agentes.
    await expect(page.getByRole("button", { name: "Criar agente" })).toHaveCount(1);
  });

  test("criar agente pela UI: card com provider/modelo e chips de ferramentas", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/agents");

    await page.getByRole("button", { name: "Criar agente" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Criar agente" })).toBeVisible();

    await dialog.getByLabel("Nome").fill("Analista Financeiro");
    await dialog.getByLabel("Descricao").fill("Analisa numeros");
    await dialog.getByLabel("System prompt").fill("Voce e um analista financeiro.");
    // Provider e Modelo ja vem preenchidos (anthropic / claude-sonnet-5).
    await expect(dialog.getByLabel("Provider")).toHaveValue("anthropic");
    await expect(dialog.getByLabel("Modelo")).toHaveValue("claude-sonnet-5");

    await dialog.getByRole("checkbox", { name: "Calculator" }).check();
    await dialog.getByRole("checkbox", { name: "Memoria persistente" }).check();
    await dialog.getByRole("button", { name: "Criar agente" }).click();

    await expect(page.getByText("Agente criado.")).toBeVisible();
    await expect(dialog).not.toBeVisible();

    const card = agentCard(page, "Analista Financeiro");
    await expect(card).toBeVisible();
    await expect(card.getByText("Analisa numeros")).toBeVisible();
    await expect(card.getByText("anthropic · claude-sonnet-5")).toBeVisible();
    // Chips usam a chave crua; as duas chaves de memoria colapsam em "memory".
    await expect(card.getByText("calculator", { exact: true })).toBeVisible();
    await expect(card.getByText("memory", { exact: true })).toBeVisible();
    await expect(card.getByText("memory_get")).toHaveCount(0);
    await expect(card.getByText("memory_set")).toHaveCount(0);

    // Agora que existe um agente, o botao do header aparece (2 "Criar agente":
    // header + nenhum empty state).
    await expect(page.getByRole("button", { name: "Criar agente" })).toHaveCount(1);
  });

  test("submit com obrigatorios vazios e no-op; Cancelar fecha sem criar", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/agents");

    await page.getByRole("button", { name: "Criar agente" }).click();
    const dialog = page.getByRole("dialog");

    // Nome e System prompt vazios (Modelo ja vem preenchido) -> guard
    // client-side impede o submit, sem toast nem erro inline.
    await dialog.getByRole("button", { name: "Criar agente" }).click();
    await expect(dialog).toBeVisible();
    await expect(page.getByText("Agente criado.")).toHaveCount(0);

    // So o nome tambem nao basta — systemPrompt e obrigatorio.
    await dialog.getByLabel("Nome").fill("Sem Prompt");
    await dialog.getByRole("button", { name: "Criar agente" }).click();
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "Nenhum agente ainda" })).toBeVisible();
  });

  test("checkbox Knowledge Base revela e esconde o select de base", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/agents");

    await page.getByRole("button", { name: "Criar agente" }).click();
    const dialog = page.getByRole("dialog");

    await expect(dialog.getByLabel("Base de conhecimento")).toHaveCount(0);
    await dialog.getByRole("checkbox", { name: "Knowledge Base" }).check();

    const select = dialog.getByLabel("Base de conhecimento");
    await expect(select).toBeVisible();
    // Workspace novo nao tem base nenhuma — so o placeholder.
    await expect(select.locator("option")).toHaveCount(1);
    await expect(select.locator("option")).toHaveText("Selecione uma base");

    await dialog.getByRole("checkbox", { name: "Knowledge Base" }).uncheck();
    await expect(dialog.getByLabel("Base de conhecimento")).toHaveCount(0);
  });

  test("excluir: confirmacao cancela e depois remove de verdade", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    await createAgentViaApi(request, tokens, workspaceId, { name: "Agente Descartavel" });
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/agents");

    // aria-label do botao de lixeira = "Excluir agente <nome>" (fix A1 desta fase).
    await page.getByLabel("Excluir agente Agente Descartavel").click();
    const alert = page.getByRole("alertdialog");
    // Aspas tipograficas no titulo.
    await expect(
      alert.getByRole("heading", { name: "Excluir o agente “Agente Descartavel”?" }),
    ).toBeVisible();
    await expect(
      alert.getByText(
        "Fluxos que usam este agente no node Agent deixarao de funcionar. Esta acao nao pode ser desfeita.",
      ),
    ).toBeVisible();

    await alert.getByRole("button", { name: "Cancelar" }).click();
    await expect(alert).not.toBeVisible();
    await expect(agentCard(page, "Agente Descartavel")).toBeVisible();

    await page.getByLabel("Excluir agente Agente Descartavel").click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click();

    await expect(page.getByText("Agente excluido.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nenhum agente ainda" })).toBeVisible();
  });

  test("agente com memoria parcial mostra o chip memory (nao a chave crua)", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    // Via API da pra gravar so UMA das duas chaves de memoria — a UI nunca
    // gera esse estado, mas tem que exibi-lo direito (fix A3 desta fase).
    await createAgentViaApi(request, tokens, workspaceId, {
      name: "Agente Memoria Parcial",
      tools: ["memory_get"],
    });
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/agents");

    const card = agentCard(page, "Agente Memoria Parcial");
    await expect(card.getByText("memory", { exact: true })).toBeVisible();
    await expect(card.getByText("memory_get")).toHaveCount(0);
  });

  test("chat de teste sem credencial: erro do servidor no toast", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    // Sem credencial (credential: "") o backend falha ANTES de qualquer
    // chamada de rede ao provider — erro deterministico e sem custo de token.
    await createAgentViaApi(request, tokens, workspaceId, { name: "Agente Sem Chave" });
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/agents");

    await agentCard(page, "Agente Sem Chave").getByRole("button", { name: "Testar" }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Testar Agente Sem Chave" }),
    ).toBeVisible();

    // Enviar comeca desabilitado (mensagem vazia).
    const send = dialog.getByRole("button", { name: "Enviar" });
    await expect(send).toBeDisabled();

    // aria-label da textarea (fix A1 desta fase) — antes so havia placeholder.
    await dialog.getByLabel("Mensagem para o agente").fill("Quanto e 2 + 2?");
    await expect(send).toBeEnabled();
    await send.click();

    await expect(
      page.getByText('Credencial "" nao encontrada neste workspace.'),
    ).toBeVisible();

    await dialog.getByRole("button", { name: "Fechar" }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("dois agentes com o mesmo nome sao aceitos (sem unique)", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    await createAgentViaApi(request, tokens, workspaceId, { name: "Agente Homonimo" });
    await createAgentViaApi(request, tokens, workspaceId, { name: "Agente Homonimo" });
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/agents");

    await expect(
      page.getByRole("heading", { level: 3, name: "Agente Homonimo", exact: true }),
    ).toHaveCount(2);
  });

  /**
   * Chat feliz com IA de verdade — gasta tokens, entao nao roda por padrao.
   * Rodar sob demanda com: playwright test --grep @ai
   * Exige E2E_ANTHROPIC_KEY no ambiente (uma chave valida da Anthropic).
   */
  test("@ai chat de teste responde com credencial real", async ({
    page,
    context,
    request,
  }) => {
    // Default de 30s do Playwright e menor que o timeout de 60s da propria
    // asserção abaixo — sem isso o teste sempre falha por timeout global
    // antes do LLM responder, independente da IA estar rapida ou não.
    test.setTimeout(90_000);
    const apiKey = process.env.E2E_ANTHROPIC_KEY;
    test.skip(!apiKey, "E2E_ANTHROPIC_KEY nao definida — teste de IA real pulado.");

    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    await createCredentialViaApi(request, tokens, workspaceId, {
      provider: "anthropic",
      name: "anthropic-e2e",
      value: apiKey!,
    });
    await createAgentViaApi(request, tokens, workspaceId, {
      name: "Agente Real",
      systemPrompt: "Responda sempre em uma unica palavra.",
      credential: "anthropic-e2e",
    });
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/agents");

    await agentCard(page, "Agente Real").getByRole("button", { name: "Testar" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Mensagem para o agente").fill("Qual a capital da Franca?");
    await dialog.getByRole("button", { name: "Enviar" }).click();

    // A resposta aparece no bloco cinza abaixo da textarea.
    const answer = dialog.locator("div.bg-muted");
    await expect(answer).toBeVisible({ timeout: 60_000 });
    await expect(answer).not.toBeEmpty();
  });
});
