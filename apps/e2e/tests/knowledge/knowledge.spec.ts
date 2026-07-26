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
import {
  createKnowledgeBaseViaApi,
  uploadDocumentViaApi,
} from "../../helpers/knowledge";

/**
 * Fase 07 — Knowledge (UI). Validacoes puras de API em api.spec.ts.
 *
 * Precisa do worker rodando (fila "ingestion") pros testes que esperam
 * "Processando" -> "Falhou"/"Pronto" — sem ele o documento fica preso em
 * "Processando" pra sempre.
 *
 * Estrategia de custo: nao existe provider de embeddings fake (a base so
 * aceita "openai", sem PATCH pra trocar depois). Criar uma base SEM
 * credencial exercita o pipeline COMPLETO do worker (fila -> processor ->
 * chunking -> falha deterministica) sem gastar nenhum token — o documento
 * termina "Falhou" com a mensagem de credencial ausente. So o caminho feliz
 * ("Pronto" + resultados de busca) precisa de OpenAI de verdade (@ai).
 *
 * Armadilhas de locator mapeadas na discovery:
 * - "Criar base" e o botao do header (so com lista nao-vazia), a acao do
 *   empty state E o titulo/submit do dialog — sempre escopar com
 *   page.getByRole("dialog"); o titulo do dialog e "Criar base de
 *   conhecimento" (h2), nao "Criar base".
 * - "Ver documentos" e Button render={<Link>}, mas o role acessivel continua
 *   sendo "button" (mesmo padrao do "Ir para Flows" da Fase 05).
 * - O h1 da lista e o back link do detalhe sao "Knowledge" (em ingles, mesmo
 *   em pt); o sidebar mostra "Conhecimento".
 * - O titulo do alertdialog de exclusao usa aspas tipograficas:
 *   Excluir a base “X”?
 * - Toast de upload usa aspas retas + em dash (U+2014):
 *   "arquivo.txt" enviado — processando.
 * - Excluir documento NAO tem confirmacao — o clique na lixeira deleta direto.
 * - setInputFiles funciona mesmo com o <input type="file"> tendo
 *   class="hidden" (Playwright nao checa visibilidade nesse caso).
 */

/** Card do grid pelo nome da base (o grid nao e tabela — sao divs). */
function kbCard(page: Page, name: string) {
  return page
    .locator("div.rounded-lg.border")
    .filter({ has: page.getByRole("heading", { level: 3, name, exact: true }) });
}

/** Linha de um documento pelo nome do arquivo. */
function documentRow(page: Page, fileName: string) {
  return page.locator("div.rounded-lg.border").filter({ hasText: fileName });
}

/**
 * Navega pro detalhe e espera a pagina estar pronta antes de agir. Primeira
 * visita a uma rota dinamica paga o compile do Turbopack (dev) — sem essa
 * espera, acoes logo apos o goto (setInputFiles, fill) podem cair num
 * document/hydration que ainda nao terminou de montar, e os toasts somem
 * (auto-dismiss) antes da assercao padrao de 5s pegar.
 */
async function gotoDetail(page: Page, kb: { id: string; name: string }) {
  await page.goto(`/knowledge/${kb.id}`);
  await expect(page.getByRole("heading", { level: 1, name: kb.name })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Knowledge (via UI)", () => {
  test("estado vazio: convite pra criar e sem botao no header", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/knowledge");

    await expect(page.getByRole("heading", { level: 1, name: "Knowledge" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Nenhuma base de conhecimento ainda" }),
    ).toBeVisible();
    await expect(
      page.getByText("Crie uma base e envie PDF, DOCX, Markdown, TXT ou CSV para comecar."),
    ).toBeVisible();
    // Com a lista vazia so ha UM "Criar base" na tela (o do empty state).
    await expect(page.getByRole("button", { name: "Criar base" })).toHaveCount(1);
  });

  test("criar base pelo dialog: card com contagem de documentos e link", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/knowledge");

    await page.getByRole("button", { name: "Criar base" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Criar base de conhecimento" })).toBeVisible();
    await expect(
      dialog.getByText(
        "Os embeddings usam OpenAI (text-embedding-3-small). Claude/Anthropic nao tem API de embeddings.",
      ),
    ).toBeVisible();

    await dialog.getByLabel("Nome").fill("Base de Testes");
    await dialog.getByLabel("Descricao").fill("Descricao de teste");
    // Credencial fica em branco de proposito.
    await dialog.getByRole("button", { name: "Criar base" }).click();

    await expect(page.getByText("Base de conhecimento criada.")).toBeVisible();
    await expect(dialog).not.toBeVisible();

    const card = kbCard(page, "Base de Testes");
    await expect(card).toBeVisible();
    await expect(card.getByText("Descricao de teste")).toBeVisible();
    await expect(card.getByText("0 documentos")).toBeVisible();
    await expect(card.getByRole("button", { name: "Ver documentos" })).toBeVisible();
  });

  test("submit com nome vazio fica desabilitado; Cancelar fecha sem criar", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/knowledge");

    await page.getByRole("button", { name: "Criar base" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Criar base" })).toBeDisabled();

    await dialog.getByLabel("Nome").fill("Nome Preenchido");
    await expect(dialog.getByRole("button", { name: "Criar base" })).toBeEnabled();
    await dialog.getByLabel("Nome").fill("");
    await expect(dialog.getByRole("button", { name: "Criar base" })).toBeDisabled();

    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "Nenhuma base de conhecimento ainda" })).toBeVisible();
  });

  test("excluir base: confirmacao cancela e depois remove de verdade", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    await createKnowledgeBaseViaApi(request, tokens, workspaceId, { name: "Base Descartavel" });
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/knowledge");

    // aria-label do botao de lixeira = "Excluir base <nome>" (fix A1 desta fase).
    await page.getByLabel("Excluir base Base Descartavel").click();
    const alert = page.getByRole("alertdialog");
    await expect(
      alert.getByRole("heading", { name: "Excluir a base “Base Descartavel”?" }),
    ).toBeVisible();
    await expect(
      alert.getByText(
        "Todos os documentos e chunks desta base serao excluidos. Agentes que usam esta base deixarao de ter acesso a ela. Esta acao nao pode ser desfeita.",
      ),
    ).toBeVisible();

    await alert.getByRole("button", { name: "Cancelar" }).click();
    await expect(alert).not.toBeVisible();
    await expect(kbCard(page, "Base Descartavel")).toBeVisible();

    await page.getByLabel("Excluir base Base Descartavel").click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click();

    await expect(page.getByText("Base de conhecimento excluida.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nenhuma base de conhecimento ainda" })).toBeVisible();
  });

  test("detalhe: navegacao, dropzone e estado vazio de documentos", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const kb = await createKnowledgeBaseViaApi(request, tokens, workspaceId, {
      name: "Base Detalhe",
    });
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/knowledge");

    await kbCard(page, "Base Detalhe").getByRole("button", { name: "Ver documentos" }).click();
    await expect(page).toHaveURL(new RegExp(`/knowledge/${kb.id}$`));

    await expect(page.getByRole("heading", { level: 1, name: "Base Detalhe" })).toBeVisible();
    await expect(
      page.getByText("Arraste um arquivo aqui ou clique para enviar"),
    ).toBeVisible();
    await expect(page.getByText("PDF, DOCX, Markdown, TXT ou CSV")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nenhum documento ainda" })).toBeVisible();
    await expect(page.getByText("Envie um arquivo acima para comecar.")).toBeVisible();

    await page.getByRole("link", { name: "Knowledge" }).click();
    await expect(page).toHaveURL(/\/knowledge$/);
  });

  test("upload sem credencial: pipeline do worker ate falhar com erro visivel", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const kb = await createKnowledgeBaseViaApi(request, tokens, workspaceId, {
      name: "Base Sem Credencial",
    });
    await authenticateContext(context, await buildStorageState(request, tokens));
    await gotoDetail(page, kb);

    await page.locator('input[type="file"]').setInputFiles({
      name: "documento.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Conteudo de teste para ingestao."),
    });

    await expect(page.getByText('"documento.txt" enviado — processando.')).toBeVisible();
    const row = documentRow(page, "documento.txt");
    await expect(row).toContainText("TXT");

    // O worker pega o job, tenta gerar embeddings, falha por falta de
    // credencial — a mensagem agora fica visivel em texto (fix A4), nao so
    // no atributo title do pill.
    await expect(row.getByText("Falhou")).toBeVisible({ timeout: 15_000 });
    await expect(
      row.getByText("Configure a credencial do provider de embeddings na base de conhecimento."),
    ).toBeVisible();
  });

  test("upload de arquivo sem texto extraivel: toast mostra a mensagem real do servidor", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const kb = await createKnowledgeBaseViaApi(request, tokens, workspaceId, {
      name: "Base Arquivo Vazio",
    });
    await authenticateContext(context, await buildStorageState(request, tokens));
    await gotoDetail(page, kb);

    await page.locator('input[type="file"]').setInputFiles({
      name: "vazio.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("   \n\n   "),
    });

    // Antes do fix A3 isso aparecia como o fallback generico
    // 'Falha ao enviar "vazio.txt".' — o hook lancava Error puro, que
    // errorMessage() nao desembrulha. Agora e ApiError e a mensagem REAL do
    // servidor chega ao toast.
    await expect(page.getByText("O arquivo nao contem texto extraivel.")).toBeVisible();
    await expect(page.getByText('Falha ao enviar "vazio.txt".')).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Nenhum documento ainda" })).toBeVisible();
  });

  test("excluir documento: sem confirmacao, deleta direto", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const kb = await createKnowledgeBaseViaApi(request, tokens, workspaceId, {
      name: "Base Documento Descartavel",
    });
    const uploadResponse = await uploadDocumentViaApi(request, tokens, workspaceId, kb.id, {
      name: "descartavel.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Conteudo descartavel."),
    });
    expect(uploadResponse.ok()).toBe(true);

    await authenticateContext(context, await buildStorageState(request, tokens));
    await gotoDetail(page, kb);

    await expect(documentRow(page, "descartavel.txt")).toBeVisible();
    // aria-label do botao de lixeira = "Excluir documento <nome>" (fix A1).
    await page.getByLabel("Excluir documento descartavel.txt").click();

    await expect(page.getByText("Documento excluido.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nenhum documento ainda" })).toBeVisible();
  });

  test("busca sem credencial: erro do servidor e dropzone acessivel por teclado", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const kb = await createKnowledgeBaseViaApi(request, tokens, workspaceId, {
      name: "Base Busca Sem Credencial",
    });
    await authenticateContext(context, await buildStorageState(request, tokens));
    await gotoDetail(page, kb);

    // aria-label do input de busca (fix A1) — antes so tinha placeholder.
    const searchInput = page.getByLabel("Busca na base de conhecimento");
    const searchButton = page.getByRole("button", { name: "Buscar" });
    await expect(searchButton).toBeDisabled();

    await searchInput.fill("Alguma pergunta sobre os documentos");
    await expect(searchButton).toBeEnabled();
    await searchButton.click();

    await expect(
      page.getByText("Configure a credencial do provider de embeddings na base de conhecimento."),
    ).toBeVisible();

    // Dropzone e um <div role="button" tabIndex={0}> (fix A4) — focavel e
    // Enter abre o seletor nativo de arquivo.
    const dropzone = page.getByRole("button", { name: "Enviar documento" });
    await dropzone.focus();
    const chooserPromise = page.waitForEvent("filechooser");
    await page.keyboard.press("Enter");
    await chooserPromise;
  });

  /**
   * Caminho feliz com OpenAI de verdade — gasta tokens de embedding, entao
   * nao roda por padrao. Rodar sob demanda com: playwright test --grep @ai
   * Exige E2E_OPENAI_KEY no ambiente (uma chave valida da OpenAI).
   */
  test("@ai upload e busca com credencial real chegam a Pronto e retornam resultados", async ({
    page,
    context,
    request,
  }) => {
    const apiKey = process.env.E2E_OPENAI_KEY;
    test.skip(!apiKey, "E2E_OPENAI_KEY nao definida — teste de IA real pulado.");

    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    await createCredentialViaApi(request, tokens, workspaceId, {
      provider: "openai",
      name: "openai-e2e",
      value: apiKey!,
    });
    const kb = await createKnowledgeBaseViaApi(request, tokens, workspaceId, {
      name: "Base Real",
      credential: "openai-e2e",
    });
    await authenticateContext(context, await buildStorageState(request, tokens));
    await gotoDetail(page, kb);

    await page.locator('input[type="file"]').setInputFiles({
      name: "receita.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "A capital da Franca e Paris. Paris e conhecida pela Torre Eiffel.",
      ),
    });

    const row = documentRow(page, "receita.txt");
    await expect(row.getByText("Pronto")).toBeVisible({ timeout: 60_000 });

    const searchInput = page.getByLabel("Busca na base de conhecimento");
    await searchInput.fill("Qual a capital da Franca?");
    await page.getByRole("button", { name: "Buscar" }).click();

    // O nome do documento no resultado da busca e um <span> (o da linha do
    // documento e um <p>) — distincao necessaria porque as duas linhas
    // compartilham a mesma classe de card (div.rounded-lg.border).
    const result = page.locator("span.text-xs.font-medium", { hasText: "receita.txt" });
    await expect(result).toBeVisible({ timeout: 30_000 });
  });
});
