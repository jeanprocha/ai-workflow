import { test, expect } from "../../helpers/fixtures";
import type { Page } from "@playwright/test";
import {
  buildTestUser,
  registerViaApi,
  buildStorageState,
  authenticateContext,
} from "../../helpers/auth";
import { fetchWorkspaceId } from "../../helpers/settings";
import {
  createWorkflowViaApi,
  saveGraphViaApi,
  TWO_NODE_GRAPH,
  DISCONNECTED_GRAPH,
  DELAY_GRAPH,
} from "../../helpers/workflows";

/**
 * Fase 04 — Editor (canvas, config panel, execucao, status ao vivo).
 * Historico de versoes tem spec proprio (versions.spec.ts); Copilot fica
 * raso aqui (so o dialog) — o teste profundo com IA real e @ai, fase 10.
 *
 * Particularidades tecnicas mapeadas na discovery:
 * - Adicionar node so via drag-and-drop HTML5 nativo (MIME custom
 *   application/x-workflow-node). page.dragTo() nao popula dataTransfer de
 *   forma confiavel em Chromium — despachamos DragEvent manualmente
 *   (dropNodeOnCanvas). O handler de drop escuta na div pai de .react-flow;
 *   como eventos DOM borbulham antes do React sintetico, disparar em
 *   .react-flow mesmo funciona.
 * - Sem autosave: toda mudanca so marca "Alterações não salvas" (texto em
 *   destaque na toolbar) — precisa clicar em "Salvar" (ou Ctrl+S) pra virar
 *   "Salvando..." -> "Salvo" de verdade. Padrao Make/n8n, ver discovery
 *   deste passo: o usuario decide quando publicar a mudanca.
 * - Deletar node/edge e so com Backspace (default do React Flow — Delete
 *   NAO funciona).
 * - React Flow da data-testid gratis: rf__wrapper, rf__node-<id>,
 *   rf__edge-<id>. Com grafo semeado via API os ids sao deterministicos
 *   (n1/n2/n3), diferente de nodes criados pela UI (nanoid aleatorio).
 * - getByLabel funciona no painel de config (fix desta fase no componente
 *   Field — antes nao havia htmlFor nenhum).
 */

async function dropNodeOnCanvas(page: Page, nodeType: string, x: number, y: number) {
  await page.locator(".react-flow").evaluate(
    (el, { nodeType, x, y }) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.setData("application/x-workflow-node", nodeType);
      const opts = { bubbles: true, cancelable: true, dataTransfer, clientX: x, clientY: y };
      el.dispatchEvent(new DragEvent("dragover", opts));
      el.dispatchEvent(new DragEvent("drop", opts));
    },
    { nodeType, x, y },
  );
}

/**
 * Confirma o estado "dirty" (alteracao marcada mas NAO persistida ainda),
 * clica em Salvar e espera o ciclo completo ("Salvando..." -> "Salvo").
 * Sem autosave, isso e o unico jeito de uma mudanca chegar no servidor.
 */
async function saveAndWait(page: Page) {
  await expect(page.getByText("Alterações não salvas")).toBeVisible();
  const saveButton = page.getByRole("button", { name: "Salvar", exact: true });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await expect(page.getByText("Salvo")).toBeVisible({ timeout: 10_000 });
  await expect(saveButton).toBeDisabled();
}

test.describe("Editor — canvas e paleta", () => {
  test("carrega o grafo semeado: nodes, labels e paleta agrupada por categoria", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Editor Basico");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, TWO_NODE_GRAPH);
    await authenticateContext(context, await buildStorageState(request, tokens));

    await page.goto(`/flows/${workflow.id}`);

    await expect(page.getByText("Editor Basico")).toBeVisible();
    await expect(page.locator('[data-testid="rf__node-n1"]')).toContainText("Manual Trigger");
    await expect(page.locator('[data-testid="rf__node-n2"]')).toContainText("Log");
    // React Flow renderiza a edge como um <g> SVG cuja bounding box o
    // Playwright as vezes considera "hidden" (path fino, altura ~0) mesmo
    // com o elemento visivel na tela — toBeAttached() confirma presenca no
    // DOM sem essa heuristica de visibilidade instavel.
    await expect(page.locator('[data-testid="rf__edge-e1"]')).toBeAttached();

    const palette = page.locator("aside").first();
    await expect(palette.getByRole("heading", { name: "Nodes" })).toBeVisible();
    await expect(palette.getByText("Arraste para o canvas.")).toBeVisible();
    await expect(palette.getByText("Triggers")).toBeVisible();
    await expect(palette.getByText("Logic")).toBeVisible();
    await expect(palette.getByText("Manual Trigger", { exact: true })).toBeVisible();
    await expect(palette.getByText("Log", { exact: true })).toBeVisible();
  });

  test("drag-and-drop adiciona node; marca alteracao nao salva; salvar persiste apos reload", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Drag And Drop");
    await authenticateContext(context, await buildStorageState(request, tokens));

    await page.goto(`/flows/${workflow.id}`);
    await expect(page.locator(".react-flow")).toBeVisible();

    await dropNodeOnCanvas(page, "trigger.manual", 500, 300);
    const node = page.locator(".react-flow__node").filter({ hasText: "Manual Trigger" });
    await expect(node).toBeVisible();
    await expect(page.getByText("Alterações não salvas")).toBeVisible();

    // Sem autosave: antes de clicar em Salvar, o grafo no servidor continua vazio.
    const beforeSave = await request.get(
      `${process.env.E2E_API_URL ?? "http://localhost:3333"}/workflows/${workflow.id}`,
      { headers: { Authorization: `Bearer ${tokens.accessToken}`, "x-workspace-id": workspaceId } },
    );
    expect((await beforeSave.json()).currentVersion.graph.nodes).toEqual([]);

    await saveAndWait(page);

    await page.reload();
    await expect(
      page.locator(".react-flow__node").filter({ hasText: "Manual Trigger" }),
    ).toBeVisible();
  });
});

test.describe("Editor — salvar manualmente", () => {
  test("botao Salvar comeca desabilitado; Ctrl+S salva sem precisar clicar", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Salvar Ctrl S");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, TWO_NODE_GRAPH);
    await authenticateContext(context, await buildStorageState(request, tokens));

    await page.goto(`/flows/${workflow.id}`);
    const saveButton = page.getByRole("button", { name: "Salvar", exact: true });
    await expect(page.getByText("Salvo")).toBeVisible();
    await expect(saveButton).toBeDisabled();

    await page.locator('[data-testid="rf__node-n2"]').click();
    const panel = page.locator("aside").last();
    await panel.getByLabel("Mensagem").fill("via Ctrl+S");

    await expect(page.getByText("Alterações não salvas")).toBeVisible();
    await expect(saveButton).toBeEnabled();

    await page.keyboard.press("ControlOrMeta+s");
    await expect(page.getByText("Salvo")).toBeVisible({ timeout: 10_000 });
    await expect(saveButton).toBeDisabled();

    const response = await request.get(
      `${process.env.E2E_API_URL ?? "http://localhost:3333"}/workflows/${workflow.id}`,
      { headers: { Authorization: `Bearer ${tokens.accessToken}`, "x-workspace-id": workspaceId } },
    );
    const body = await response.json();
    const savedNode = body.currentVersion.graph.nodes.find((n: { id: string }) => n.id === "n2");
    expect(savedNode.config.message).toBe("via Ctrl+S");
  });

  test("selecionar um node (sem editar nada) NAO marca alteracoes nao salvas", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Selecionar Sem Editar");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, TWO_NODE_GRAPH);
    await authenticateContext(context, await buildStorageState(request, tokens));

    await page.goto(`/flows/${workflow.id}`);
    await page.locator('[data-testid="rf__node-n1"]').click();
    await page.locator('[data-testid="rf__node-n2"]').click();
    await page.locator(".react-flow__pane").click({ position: { x: 50, y: 50 } });

    await expect(page.getByText("Salvo")).toBeVisible();
    await expect(page.getByRole("button", { name: "Salvar", exact: true })).toBeDisabled();
  });
});

test.describe("Editor — painel de configuracao", () => {
  test("selecionar abre o painel; clique no pane e no X fecham", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Painel Config");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, TWO_NODE_GRAPH);
    await authenticateContext(context, await buildStorageState(request, tokens));

    await page.goto(`/flows/${workflow.id}`);
    await page.locator('[data-testid="rf__node-n2"]').click();

    // Com o painel aberto ha 2 <aside> (paleta + painel) — o painel e o
    // ULTIMO no DOM. Depois que ele fecha so sobra a paleta: "aside".last()
    // reavalia e passa a apontar pra ELA (que continua visivel), entao a
    // asercao de fechamento e por CONTAGEM, nao por not.toBeVisible() num
    // locator que muda de alvo.
    await expect(page.locator("aside")).toHaveCount(2);
    const panel = page.locator("aside").last();
    await expect(panel.getByText("Log", { exact: true })).toBeVisible();
    await expect(panel.getByText("logic.log")).toBeVisible();
    await expect(panel.getByLabel("Mensagem")).toBeVisible();

    // Clique no pane vazio fecha.
    await page.locator(".react-flow__pane").click({ position: { x: 50, y: 50 } });
    await expect(page.locator("aside")).toHaveCount(1);

    // Reabre e fecha pelo X (aria-label do fix desta fase).
    await page.locator('[data-testid="rf__node-n2"]').click();
    await expect(page.locator("aside")).toHaveCount(2);
    await page.getByLabel("Fechar painel de configuração").click();
    await expect(page.locator("aside")).toHaveCount(1);
  });

  test("editar Mensagem: precisa salvar manualmente; subtitle do node atualiza", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Editar Mensagem");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, TWO_NODE_GRAPH);
    await authenticateContext(context, await buildStorageState(request, tokens));

    await page.goto(`/flows/${workflow.id}`);
    await page.locator('[data-testid="rf__node-n2"]').click();

    const panel = page.locator("aside").last();
    await panel.getByLabel("Mensagem").fill("Ola do teste E2E");
    await saveAndWait(page);

    await expect(page.locator('[data-testid="rf__node-n2"]')).toContainText(
      "Ola do teste E2E",
    );

    // Persiste de verdade (nao so em memoria) — confere via API.
    const graphResponse = await request.get(
      `${process.env.E2E_API_URL ?? "http://localhost:3333"}/workflows/${workflow.id}`,
      { headers: { Authorization: `Bearer ${tokens.accessToken}`, "x-workspace-id": workspaceId } },
    );
    const body = await graphResponse.json();
    const savedNode = body.currentVersion.graph.nodes.find((n: { id: string }) => n.id === "n2");
    expect(savedNode.config.message).toBe("Ola do teste E2E");
  });

  test("toggle de retry revela Tentativas e Intervalo", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Retry Toggle");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, TWO_NODE_GRAPH);
    await authenticateContext(context, await buildStorageState(request, tokens));

    await page.goto(`/flows/${workflow.id}`);
    await page.locator('[data-testid="rf__node-n2"]').click();

    const panel = page.locator("aside").last();
    const retryToggle = panel.getByLabel("Tentar novamente em caso de erro");
    await expect(panel.getByLabel("Tentativas")).not.toBeVisible();

    await retryToggle.check();
    await expect(panel.getByLabel("Tentativas")).toHaveValue("3");
    await expect(panel.getByLabel("Intervalo (ms)")).toHaveValue("1000");
    await saveAndWait(page);
  });
});

test.describe("Editor — canvas: conectar e deletar", () => {
  test("arrastar de um handle a outro cria uma edge", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Conectar Nodes");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, DISCONNECTED_GRAPH);
    await authenticateContext(context, await buildStorageState(request, tokens));

    await page.goto(`/flows/${workflow.id}`);
    await expect(page.locator(".react-flow__edge")).toHaveCount(0);

    await page.locator('[data-testid="rf__node-n1"] .react-flow__handle-right').hover();
    await page.mouse.down();
    await page.locator('[data-testid="rf__node-n2"] .react-flow__handle-left').hover();
    await page.mouse.up();

    await expect(page.locator(".react-flow__edge")).toHaveCount(1);
    // Ver comentario na primeira spec sobre toBeAttached() vs toBeVisible() em edges SVG.
    await expect(page.getByRole("group", { name: "Edge from n1 to n2" })).toBeAttached();
    await saveAndWait(page);
  });

  test("Backspace deleta o node selecionado (Delete nao faz nada)", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Deletar Node");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, TWO_NODE_GRAPH);
    await authenticateContext(context, await buildStorageState(request, tokens));

    await page.goto(`/flows/${workflow.id}`);
    await page.locator('[data-testid="rf__node-n2"]').click();

    // Delete (tecla) e um no-op documentado — so Backspace remove.
    await page.keyboard.press("Delete");
    await expect(page.locator('[data-testid="rf__node-n2"]')).toBeVisible();

    await page.keyboard.press("Backspace");
    await expect(page.locator('[data-testid="rf__node-n2"]')).not.toBeVisible();
    // A edge que apontava pro node removido some junto.
    await expect(page.locator(".react-flow__edge")).toHaveCount(0);
    await saveAndWait(page);
  });
});

test.describe("Editor — executar fluxo", () => {
  test("payload JSON invalido: erro no toast, dialog continua aberto", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Payload Invalido");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, TWO_NODE_GRAPH);
    await authenticateContext(context, await buildStorageState(request, tokens));

    await page.goto(`/flows/${workflow.id}`);
    await page.getByRole("button", { name: "Executar" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Executar fluxo" })).toBeVisible();
    await dialog.getByRole("textbox").fill("{ invalido");
    await dialog.getByRole("button", { name: "Executar", exact: true }).click();

    await expect(page.getByText("O payload precisa ser um JSON válido.")).toBeVisible();
    await expect(dialog).toBeVisible();
  });

  test("payload valido: inicia execucao, toast de sucesso, sem navegar", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Rodar Fluxo");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, TWO_NODE_GRAPH);
    await authenticateContext(context, await buildStorageState(request, tokens));

    await page.goto(`/flows/${workflow.id}`);
    await page.getByRole("button", { name: "Executar" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Executar", exact: true }).click();

    await expect(page.getByText("Execução iniciada.")).toBeVisible();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/flows/${workflow.id}$`));
  });

  test("status ao vivo via SSE: running -> sucesso no node durante a execucao real", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Status Ao Vivo");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, DELAY_GRAPH);
    await authenticateContext(context, await buildStorageState(request, tokens));

    await page.goto(`/flows/${workflow.id}`);
    await page.getByRole("button", { name: "Executar" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Executar", exact: true }).click();
    await expect(page.getByText("Execução iniciada.")).toBeVisible();

    // O node n2 (delay de 3s) fica "running" — unico status com role/aria-label.
    const delayNode = page.locator('[data-testid="rf__node-n2"]');
    await expect(delayNode.getByRole("status", { name: "Em execução" })).toBeVisible({
      timeout: 5000,
    });

    // Depois do delay, os 3 nodes terminam com sucesso (icone Check, sem role —
    // so da pra confirmar por classe CSS mesmo, gap de a11y ja documentado).
    await expect(page.locator('[data-testid="rf__node-n3"] .text-success')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('[data-testid="rf__node-n2"] .text-success')).toBeVisible();
    await expect(page.locator('[data-testid="rf__node-n1"] .text-success')).toBeVisible();
  });
});

test.describe("Editor — Copilot (dialog raso, sem chamada real de IA)", () => {
  test("abre com Provider/Modelo/credencial e chips de sugestao", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Copilot Dialog");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, TWO_NODE_GRAPH);
    await authenticateContext(context, await buildStorageState(request, tokens));

    await page.goto(`/flows/${workflow.id}`);
    await page.getByRole("button", { name: "Copilot" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Copilot" })).toBeVisible();
    await expect(dialog.getByLabel("Provider")).toHaveValue("anthropic");
    await expect(dialog.getByText("Pergunte algo, ou tente:")).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Como melhorar este fluxo?" }),
    ).toBeVisible();
    await expect(dialog.getByPlaceholder("Pergunte sobre o fluxo...")).toBeVisible();
    await expect(dialog.getByLabel("Enviar mensagem")).toBeVisible();
  });
});

test.describe("Editor — node Switch", () => {
  test("5 saidas com um caso longo: rotulos ficam dentro do card, sem vazar", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Switch Overflow");
    const longCase = "Regiao-Metropolitana-Sao-Paulo-Extremo-Sul-Litoral";
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, {
      nodes: [
        {
          id: "n1",
          type: "trigger.manual",
          category: "trigger",
          label: "Manual Trigger",
          position: { x: 0, y: 0 },
          config: {},
        },
        {
          id: "n2",
          type: "logic.switch",
          category: "logic",
          label: "Switch",
          position: { x: 320, y: 0 },
          config: { value: "{{ $input.regiao }}", cases: [longCase, "RJ", "MG", "BA"] },
        },
      ],
      edges: [{ id: "e1", source: "n1", target: "n2" }],
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    await authenticateContext(context, await buildStorageState(request, tokens));

    await page.goto(`/flows/${workflow.id}`);

    const card = page.locator('[data-testid="rf__node-n2"]');
    await expect(card).toBeVisible();
    const cardBox = await card.boundingBox();
    expect(cardBox).not.toBeNull();

    // Os 5 rotulos de saida (0/1/2/3/default) — os 4 primeiros mostram o
    // valor do caso configurado, nao o indice cru (ver outputLabel() em
    // workflow-node.tsx); o mais longo vem com title pro texto inteiro.
    const labels = card.locator("span.truncate.font-mono");
    await expect(labels).toHaveCount(5);
    await expect(labels.first()).toHaveAttribute("title", longCase);

    for (let i = 0; i < 5; i += 1) {
      const labelBox = await labels.nth(i).boundingBox();
      expect(labelBox).not.toBeNull();
      // Cada rotulo precisa caber inteiro dentro da altura do card — antes
      // da altura minima proporcional ao numero de saidas, era exatamente
      // isso que vazava por baixo da borda com 5 saidas.
      expect(labelBox!.y).toBeGreaterThanOrEqual(cardBox!.y - 0.5);
      expect(labelBox!.y + labelBox!.height).toBeLessThanOrEqual(cardBox!.y + cardBox!.height + 0.5);
    }
  });
});
