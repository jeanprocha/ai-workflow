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
