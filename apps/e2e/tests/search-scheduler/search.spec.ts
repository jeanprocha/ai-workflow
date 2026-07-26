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
  runWorkflowViaApi,
  waitForExecutionStatus,
  MINIMAL_GRAPH,
} from "../../helpers/workflows";
import { createAgentViaApi } from "../../helpers/agents";

/**
 * Fase 11 — Busca global (Ctrl+K). Scheduler fica em scheduler.spec.ts.
 *
 * Precisa do worker rodando pra o teste que busca por execucao (precisa
 * chegar a "success").
 *
 * Armadilhas de locator mapeadas na discovery:
 * - Antes do fix A1, o dialog sr-only "Busca global"/descricao ficava no
 *   DOM de TODA pagina autenticada mesmo com a palette fechada (Dialog.Root
 *   renderiza filhos incondicionalmente; so o Popup monta/desmonta). Sempre
 *   usar getByPlaceholder/getByRole("dialog") pra provar que abriu, nunca
 *   getByText("Busca global").
 * - Sem query: grupos "Acoes rapidas" e "Navegar" — os itens de nav tem o
 *   MESMO texto dos headings de grupo que aparecem com query (ex.:
 *   "Fluxos"/"Agentes"/"Execucoes") — nao ambiguo aqui porque nunca
 *   coexistem (um ou outro, dependendo se ha query).
 * - Sem indicador de loading nenhum — nunca assertar ausencia de resultado
 *   logo apos digitar; sempre esperar com o timeout padrao do expect.
 * - "Templates" e "Agentes" navegam pra rota FIXA da lista (/templates,
 *   /agents), nao pro item especifico.
 * - Debounce de 250ms entre digitar e a troca de grupos estaticos ->
 *   resultados do servidor.
 * - O heading de cada grupo (cmdk) e renderizado com aria-hidden="true"
 *   (decorativo pro screen reader, que le so os options via aria-labelledby
 *   apontando pra ele) — isso significa que o proprio heading FICA FORA da
 *   arvore de acessibilidade, e getByRole("group", { name }) nao encontra
 *   nome nenhum (aria-labelledby pra um no oculto nao produz accname).
 *   Por isso o helper `resultGroup` busca o texto do heading (getByText
 *   ignora aria-hidden) e navega ate o irmao seguinte, que e o
 *   role="group" de verdade com os options dentro.
 */

/** Container role="group" de um grupo de resultados, localizado pelo texto do heading (aria-hidden). */
function resultGroup(page: Page, heading: string) {
  return page
    .getByText(heading, { exact: true })
    .locator("xpath=following-sibling::div[@role='group']");
}

test.describe("Busca global (Ctrl+K)", () => {
  test("abre e fecha por teclado, botao e Esc; fechada nao vaza no DOM (valida fix A1)", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/dashboard");

    // Fechada: o titulo/descricao sr-only do dialog NAO deve estar no DOM.
    await expect(page.getByText("Busca global")).toHaveCount(0);

    await page.keyboard.press("Control+k");
    const input = page.getByPlaceholder(/Pesquisar fluxos/);
    await expect(input).toBeVisible();

    await page.keyboard.press("Control+k");
    await expect(input).not.toBeVisible();
    await expect(page.getByText("Busca global")).toHaveCount(0);

    await page.getByRole("button", { name: /Pesquisar/ }).click();
    await expect(input).toBeVisible();

    await input.fill("algo");
    await page.keyboard.press("Escape");
    await expect(input).not.toBeVisible();

    // Reabrir: a query foi limpa (Esc reseta o estado).
    await page.getByRole("button", { name: /Pesquisar/ }).click();
    await expect(input).toHaveValue("");
  });

  test("sem query: Acoes rapidas e Navegar; Criar fluxo e Configuracoes navegam", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/dashboard");

    await page.keyboard.press("Control+k");
    await expect(page.getByRole("option", { name: "Criar fluxo" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Configuracoes" })).toBeVisible();

    await page.getByRole("option", { name: "Configuracoes" }).click();
    await expect(page).toHaveURL(/\/settings$/);

    await page.keyboard.press("Control+k");
    await page.getByRole("option", { name: "Criar fluxo" }).click();
    await expect(page).toHaveURL(/\/flows\/new$/);
  });

  test("busca por fluxo: grupo Fluxos, listbox com nome traduzido (valida fix A3), navega pro editor", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const suffix = `Busca${Date.now()}`;
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, `Fluxo ${suffix}`);

    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/dashboard");
    await page.keyboard.press("Control+k");

    // aria-label da lista de resultados (fix A3) — antes era "Suggestions" em ingles.
    await expect(page.getByRole("listbox", { name: "Resultados da busca" })).toBeVisible();

    await page.getByPlaceholder(/Pesquisar fluxos/).fill(suffix);
    await expect(resultGroup(page, "Fluxos")).toBeVisible();
    await page.getByRole("option", { name: `Fluxo ${suffix}` }).click();
    await expect(page).toHaveURL(new RegExp(`/flows/${workflow.id}$`));
  });

  test("busca por node: grupo Nodes com label do node e nome do fluxo", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const suffix = `NodeBusca${Date.now()}`;
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo Com Node");
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, {
      nodes: [
        {
          id: "n1",
          type: "trigger.manual",
          category: "trigger",
          label: `Log-${suffix}`,
          position: { x: 0, y: 0 },
          config: {},
        },
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/dashboard");
    await page.keyboard.press("Control+k");
    await page.getByPlaceholder(/Pesquisar fluxos/).fill(suffix);

    const nodesGroup = resultGroup(page, "Nodes");
    await expect(nodesGroup).toBeVisible();
    const item = nodesGroup.getByRole("option", { name: new RegExp(`Log-${suffix}`) });
    await expect(item).toContainText("Fluxo Com Node");
    await item.click();
    await expect(page).toHaveURL(new RegExp(`/flows/${workflow.id}$`));
  });

  test("busca por execucao, agente e template do seed; termo inexistente mostra vazio", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const suffix = `ExecBusca${Date.now()}`;
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, `Fluxo ${suffix}`);
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, MINIMAL_GRAPH);
    const exec = await runWorkflowViaApi(request, tokens, workspaceId, workflow.id);
    await waitForExecutionStatus(request, tokens, workspaceId, exec.id, "success");

    const agentSuffix = `AgenteBusca${Date.now()}`;
    await createAgentViaApi(request, tokens, workspaceId, { name: `Agente ${agentSuffix}` });

    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/dashboard");
    await page.keyboard.press("Control+k");

    await page.getByPlaceholder(/Pesquisar fluxos/).fill(suffix);
    await expect(resultGroup(page, "Execucoes")).toBeVisible();
    await expect(
      resultGroup(page, "Execucoes").getByRole("option", { name: new RegExp(`Fluxo ${suffix}`) }),
    ).toBeVisible();

    await page.getByPlaceholder(/Pesquisar fluxos/).fill(agentSuffix);
    await expect(resultGroup(page, "Agentes")).toBeVisible();
    await expect(page.getByRole("option", { name: `Agente ${agentSuffix}` })).toBeVisible();

    await page.getByPlaceholder(/Pesquisar fluxos/).fill("Suporte IA");
    await expect(resultGroup(page, "Templates")).toBeVisible();
    await expect(page.getByRole("option", { name: "Suporte IA" })).toBeVisible();

    await page.getByPlaceholder(/Pesquisar fluxos/).fill("termo-que-nunca-vai-existir-em-lugar-nenhum-xyz");
    await expect(page.getByText("Nenhum resultado encontrado.")).toBeVisible();
  });

  test("navegacao por teclado: seta move a selecao, Enter abre o item selecionado", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/dashboard");
    await page.keyboard.press("Control+k");

    // Sem query: "Criar fluxo" e o primeiro item (grupo Acoes rapidas),
    // ja vem selecionado por padrao no cmdk.
    const createFlowOption = page.getByRole("option", { name: "Criar fluxo" });
    await expect(createFlowOption).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("ArrowDown");
    await expect(createFlowOption).toHaveAttribute("aria-selected", "false");

    await page.keyboard.press("ArrowUp");
    await expect(createFlowOption).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/flows\/new$/);
  });
});
