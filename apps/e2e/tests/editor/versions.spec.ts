import { test, expect } from "../../helpers/fixtures";
import type { Locator, Page } from "@playwright/test";
import {
  buildTestUser,
  registerViaApi,
  buildStorageState,
  authenticateContext,
} from "../../helpers/auth";
import { fetchWorkspaceId } from "../../helpers/settings";
import { createWorkflowViaApi, saveGraphViaApi, TWO_NODE_GRAPH } from "../../helpers/workflows";

/**
 * Fase 04 — Historico de versoes. Toda save (autosave do editor OU
 * saveGraphViaApi aqui) cria uma versao NOVA, mesmo com conteudo identico —
 * por isso "sem diferencas" e testado salvando o MESMO grafo duas vezes, nao
 * pulando o save.
 *
 * diffGraphs(base=atual, compare=linha) — nodes que existem na atual mas nao
 * na versao antiga aparecem como REMOVIDOS ("-"), nao adicionados: o diff
 * mostra "o que muda indo da atual pra aquela versao", nao o inverso.
 *
 * Linhas de versao sao listadas por versionNumber desc (mais nova primeiro)
 * — em vez de escopar por texto "v{n}" (o badge "atual" fica concatenado no
 * mesmo <p> pra versao corrente, o que complica match exato), usamos indice
 * posicional: rows.nth(0) e sempre a mais recente.
 */

const EMPTY_GRAPH = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
};

function versionRows(dialog: Locator): Locator {
  return dialog.locator("div.rounded-lg.border-border");
}

async function openHistory(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Historico" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Historico de versoes" })).toBeVisible();
  return dialog;
}

test.describe("Historico de versoes", () => {
  test("lista versoes com badge atual; Restaurar so aparece nas antigas", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Historico Basico");
    // v1 = EMPTY_GRAPH (da criacao) -> v2 = TWO_NODE_GRAPH.
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, TWO_NODE_GRAPH);
    await authenticateContext(context, await buildStorageState(request, tokens));

    await page.goto(`/flows/${workflow.id}`);
    const dialog = await openHistory(page);

    const rows = versionRows(dialog);
    await expect(rows).toHaveCount(2);

    // v2 (indice 0, mais recente) e a atual.
    await expect(rows.nth(0)).toContainText("v2");
    await expect(rows.nth(0)).toContainText("atual");
    await expect(rows.nth(0).getByRole("button", { name: "Restaurar" })).not.toBeVisible();

    // v1 (indice 1) nao e a atual e tem o botao Restaurar.
    await expect(rows.nth(1)).toContainText("v1");
    await expect(rows.nth(1)).not.toContainText("atual");
    await expect(rows.nth(1).getByRole("button", { name: "Restaurar" })).toBeVisible();
  });

  test("Ver diff mostra nodes removidos ao comparar com versao antiga; grafos identicos mostram sem diferencas", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Historico Diff");
    // v1 = EMPTY_GRAPH -> v2 = TWO_NODE_GRAPH -> v3 = TWO_NODE_GRAPH de novo (identico a v2).
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, TWO_NODE_GRAPH);
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, TWO_NODE_GRAPH);
    await authenticateContext(context, await buildStorageState(request, tokens));

    await page.goto(`/flows/${workflow.id}`);
    const dialog = await openHistory(page);
    const rows = versionRows(dialog);
    await expect(rows).toHaveCount(3);

    // diffGraphs(base=atual, compare=linha): nodes que existem na atual (v3)
    // mas nao na versao antiga (v1, vazia) aparecem como REMOVIDOS ("-") —
    // e o diff de "o que muda indo de v3 pra v1", nao o inverso.
    const v1Row = rows.nth(2);
    await expect(v1Row).toContainText("v1");
    await v1Row.getByRole("button", { name: "Ver diff" }).click();
    await expect(v1Row.getByText("- Manual Trigger")).toBeVisible();
    await expect(v1Row.getByText("- Log")).toBeVisible();
    await v1Row.getByRole("button", { name: "Ocultar diff" }).click();
    await expect(v1Row.getByText("- Manual Trigger")).not.toBeVisible();

    // v2 (indice 1, mesmo conteudo de v3) vs atual: sem diferencas.
    const v2Row = rows.nth(1);
    await expect(v2Row).toContainText("v2");
    await v2Row.getByRole("button", { name: "Ver diff" }).click();
    await expect(v2Row.getByText("Sem diferencas de nodes entre as versoes.")).toBeVisible();
  });

  test("restaurar: confirmacao, cancela, depois restaura de verdade (recarrega com o grafo antigo)", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Restaurar Versao");
    // v1 = EMPTY_GRAPH -> v2 = TWO_NODE_GRAPH (atual).
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, TWO_NODE_GRAPH);
    await authenticateContext(context, await buildStorageState(request, tokens));

    await page.goto(`/flows/${workflow.id}`);
    await expect(page.locator('[data-testid="rf__node-n1"]')).toBeVisible();

    const dialog = await openHistory(page);
    const v1Row = versionRows(dialog).nth(1);
    await expect(v1Row).toContainText("v1");
    await v1Row.getByRole("button", { name: "Restaurar" }).click();

    const alert = page.getByRole("alertdialog");
    await expect(alert.getByRole("heading", { name: "Restaurar a v1?" })).toBeVisible();
    await expect(
      alert.getByText(
        "Isso cria uma nova versao com o grafo desta versao antiga e a torna a atual. O historico e preservado — nada e perdido.",
      ),
    ).toBeVisible();

    // Cancelar nao restaura nada.
    await alert.getByRole("button", { name: "Cancelar" }).click();
    await expect(alert).not.toBeVisible();
    await expect(page.locator('[data-testid="rf__node-n1"]')).toBeVisible();

    // Confirmar: cria v3 (clone de v1, vazio) e recarrega a pagina inteira.
    await v1Row.getByRole("button", { name: "Restaurar" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Restaurar" }).click();

    // onRestored() chama window.location.reload() logo em seguida — o
    // toast pode nao sobreviver ate a asercao rodar, entao o que importa
    // e validar o estado FINAL pos-reload: canvas vazio (grafo de v1).
    await page.waitForURL(new RegExp(`/flows/${workflow.id}$`));
    await expect(page.locator(".react-flow")).toBeVisible();
    await expect(page.locator('[data-testid="rf__node-n1"]')).not.toBeVisible();
    await expect(page.locator(".react-flow__node")).toHaveCount(0);

    // Confirma via API tambem: workflow agora tem v3 (nao v1) como atual, com grafo vazio.
    const response = await request.get(
      `${process.env.E2E_API_URL ?? "http://localhost:3333"}/workflows/${workflow.id}`,
      { headers: { Authorization: `Bearer ${tokens.accessToken}`, "x-workspace-id": workspaceId } },
    );
    const body = await response.json();
    expect(body.currentVersion.versionNumber).toBe(3);
    expect(body.currentVersion.graph.nodes).toEqual(EMPTY_GRAPH.nodes);
  });
});
