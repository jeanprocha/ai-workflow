import { test, expect } from "../../helpers/fixtures";
import { buildTestUser, registerViaApi } from "../../helpers/auth";
import { fetchWorkspaceId } from "../../helpers/settings";
import { createWorkflowViaApi, saveGraphViaApi, chatGraph } from "../../helpers/workflows";

/**
 * Fase Chat — paginas publicas /chat/[token] (visitante) e /inbox/[token]
 * (operador). Nenhuma das duas exige sessao (proxy.ts trata "/chat" e
 * "/inbox" como PUBLIC_ROUTES) — os testes aqui navegam direto, sem
 * authenticateContext.
 */

async function setupChatWorkflow(
  request: Parameters<typeof createWorkflowViaApi>[0],
  tokens: Awaited<ReturnType<typeof registerViaApi>>,
  workspaceId: string,
  name: string,
) {
  const workflow = await createWorkflowViaApi(request, tokens, workspaceId, name);
  const saved = await saveGraphViaApi(
    request,
    tokens,
    workspaceId,
    workflow.id,
    chatGraph({ replyMessage: "Você disse: {{ $input.message }}" }),
  );
  if (!saved.chatToken || !saved.inboxToken) {
    throw new Error("saveGraphViaApi nao gerou chatToken/inboxToken.");
  }
  return { workflow, chatToken: saved.chatToken, inboxToken: saved.inboxToken };
}

test.describe("Chat público (visitante)", () => {
  test("conversa ponta a ponta e retomada por localStorage ao recarregar", async ({
    page,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const { chatToken } = await setupChatWorkflow(request, tokens, workspaceId, "Chat UI Visitante");

    await page.goto(`/chat/${chatToken}`);

    const composer = page.getByPlaceholder("Digite sua mensagem...");
    await expect(composer).toBeEnabled({ timeout: 15_000 });

    await composer.fill("oi, tudo bem?");
    await page.getByRole("button", { name: "Enviar mensagem" }).click();

    // { exact: true } pra nao colidir com "Você disse: oi, tudo bem?" (contem a mesma substring).
    await expect(page.getByText("oi, tudo bem?", { exact: true })).toBeVisible();
    await expect(page.getByText("Você disse: oi, tudo bem?")).toBeVisible({ timeout: 15_000 });

    // Recarrega: mesma conversa (localStorage), sem duplicar a mensagem nem
    // criar uma conversa nova — a resposta do bot continua visivel.
    await page.reload();
    await expect(page.getByText("oi, tudo bem?", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Você disse: oi, tudo bem?")).toBeVisible();
  });

  test("chatToken invalido mostra tela de link invalido, sem travar a pagina", async ({ page }) => {
    await page.goto("/chat/token-que-nao-existe");
    await expect(page.getByText("Link inválido")).toBeVisible({ timeout: 15_000 });
  });

  test("mensagem longa (ex.: lista de produtos): mostra 10 linhas, 'Mostrar mais' revela o resto aos poucos", async ({
    page,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    // O bot manda a lista INTEIRA numa unica mensagem — quem decide quantas
    // linhas mostrar de cada vez e a tela, nao o fluxo (ver "vamos dar
    // sequencia no fluxo": "mostrar mais" foi pensado pra nao precisar de
    // ida-e-volta com o backend a cada clique).
    const items = Array.from({ length: 25 }, (_, i) => `Item ${i + 1}`).join("\n");
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Chat UI Mostrar Mais");
    const saved = await saveGraphViaApi(
      request,
      tokens,
      workspaceId,
      workflow.id,
      chatGraph({ replyMessage: items }),
    );
    if (!saved.chatToken) throw new Error("saveGraphViaApi nao gerou chatToken.");

    await page.goto(`/chat/${saved.chatToken}`);
    const composer = page.getByPlaceholder("Digite sua mensagem...");
    await expect(composer).toBeEnabled({ timeout: 15_000 });
    await composer.fill("busca");
    await page.getByRole("button", { name: "Enviar mensagem" }).click();

    // getByText normaliza espacos (quebra de linha vira espaco) — "Item 10"
    // como substring continua identificando a linha certa sem colidir com
    // "Item 1" (string diferente), mesmo dentro de um bloco multi-linha.
    const showMore = page.getByRole("button", { name: "Mostrar mais" });
    await expect(page.getByText("Item 10")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Item 11")).not.toBeVisible();
    await expect(showMore).toBeVisible();

    await showMore.click();
    await expect(page.getByText("Item 20")).toBeVisible();
    await expect(page.getByText("Item 21")).not.toBeVisible();
    await expect(showMore).toBeVisible();

    await showMore.click();
    await expect(page.getByText("Item 25")).toBeVisible();
    await expect(showMore).not.toBeVisible();
  });

  test("linha de catalogo ('codigo - descricao - preco') renderiza codigo e preco destacados, nao como texto corrido", async ({
    page,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    // Formato produzido pelo systemPrompt do node ai.chat no fluxo de vendas
    // (ver docs/integracoes/rein.md) — a descricao pode ter hifen proprio
    // ("LE42H057 - PCI-BC-374"), por isso o segundo item testa exatamente
    // essa ambiguidade.
    const replyMessage = [
      "30342 - KIT 4 BARRA DE LED TV LE42H057D LE42H057 - PCI-BC-374 - R$ 107,17",
      "30291 - KIT 2 BARRAS DE LED TV PTV32T10 - PCI-BC-346 - R$ 52,77",
    ].join("\n");
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Chat UI Linha Catalogo");
    const saved = await saveGraphViaApi(
      request,
      tokens,
      workspaceId,
      workflow.id,
      chatGraph({ replyMessage }),
    );
    if (!saved.chatToken) throw new Error("saveGraphViaApi nao gerou chatToken.");

    await page.goto(`/chat/${saved.chatToken}`);
    const composer = page.getByPlaceholder("Digite sua mensagem...");
    await expect(composer).toBeEnabled({ timeout: 15_000 });
    await composer.fill("busca");
    await page.getByRole("button", { name: "Enviar mensagem" }).click();

    // Codigo e preco como elementos PROPRIOS (exact:true so acha um match se
    // for um no isolado, nao uma substring dentro de um paragrafo unico) —
    // prova que a linha foi de fato parseada, nao so exibida como texto cru.
    await expect(page.getByText("30342", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("R$ 107,17", { exact: true })).toBeVisible();
    await expect(
      page.getByText("KIT 4 BARRA DE LED TV LE42H057D LE42H057 - PCI-BC-374", { exact: true }),
    ).toBeVisible();

    await expect(page.getByText("30291", { exact: true })).toBeVisible();
    await expect(page.getByText("R$ 52,77", { exact: true })).toBeVisible();
    await expect(
      page.getByText("KIT 2 BARRAS DE LED TV PTV32T10 - PCI-BC-346", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("Inbox público (operador)", () => {
  test("inbox mostra a conversa e a resposta manual do operador chega pro visitante via polling", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const { chatToken, inboxToken } = await setupChatWorkflow(request, tokens, workspaceId, "Chat UI Inbox");

    // Visitante manda uma mensagem primeiro, numa aba separada, pra existir
    // conversa quando a inbox abrir.
    const visitorPage = await context.newPage();
    await visitorPage.goto(`/chat/${chatToken}`);
    const composer = visitorPage.getByPlaceholder("Digite sua mensagem...");
    await expect(composer).toBeEnabled({ timeout: 15_000 });
    await composer.fill("preciso de ajuda");
    await visitorPage.getByRole("button", { name: "Enviar mensagem" }).click();
    await expect(visitorPage.getByText("Você disse: preciso de ajuda")).toBeVisible({ timeout: 15_000 });

    await page.goto(`/inbox/${inboxToken}`);
    await expect(page.getByText(/Bot: Você disse: preciso de ajuda/)).toBeVisible({ timeout: 15_000 });
    await page.getByText(/Bot: Você disse: preciso de ajuda/).click();

    const operatorComposer = page.getByPlaceholder("Responder como atendente...");
    await operatorComposer.fill("Aqui é o atendente, já te ajudo!");
    await page.getByRole("button", { name: "Enviar resposta" }).click();
    // { exact: true } evita colidir com o preview truncado na lista de
    // conversas ("Atendente: Aqui é o atendente, já te ajudo!" tambem contem
    // a substring — strict mode do Playwright rejeita a ambiguidade).
    await expect(page.getByText("Aqui é o atendente, já te ajudo!", { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // Chega pro visitante (polling de ~2.5s), sem precisar recarregar a pagina dele.
    await expect(
      visitorPage.getByText("Aqui é o atendente, já te ajudo!", { exact: true }),
    ).toBeVisible({
      timeout: 15_000,
    });

    await visitorPage.close();
  });

  test("inboxToken invalido mostra tela de link invalido", async ({ page }) => {
    await page.goto("/inbox/token-que-nao-existe");
    await expect(page.getByText("Link inválido")).toBeVisible({ timeout: 15_000 });
  });
});
