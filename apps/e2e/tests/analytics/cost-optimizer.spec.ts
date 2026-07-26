import { test, expect } from "../../helpers/fixtures";
import {
  buildTestUser,
  registerViaApi,
  buildStorageState,
  authenticateContext,
} from "../../helpers/auth";

/**
 * Fase 09 — Cost Optimizer (parte determinística). O algoritmo e uma
 * heuristica pura sobre ExecutionStep — nao chama LLM nenhum — mas gerar
 * uma sugestao real exige >=3 execucoes de node ai.* com provider de
 * verdade (caro). Aqui cobrimos so o que um workspace novo sempre produz:
 * os dois empty states e a ausencia do bug de dois botoes "Analisar"
 * simultaneos (fix A4). O caminho com sugestao real fica documentado no
 * roteiro manual.
 */

test.describe("Cost Optimizer", () => {
  test("estado inicial tem um so botao Analisar; apos clicar, empty de oportunidades", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/cost-optimizer");

    await expect(page.getByRole("heading", { level: 1, name: "Otimizador de Custo" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ainda não analisado" })).toBeVisible();
    await expect(
      page.getByText(
        "Clique em Analisar para ver oportunidades reais de economia com base no que os seus fluxos já rodaram.",
      ),
    ).toBeVisible();

    // Fix A4: antes desta fase existiam DOIS botoes "Analisar" visiveis ao
    // mesmo tempo (header + acao do empty state) — strict mode violation.
    const analyzeButton = page.getByRole("button", { name: "Analisar", exact: true });
    await expect(analyzeButton).toHaveCount(1);
    await analyzeButton.click();

    await expect(page.getByRole("heading", { name: "Nenhuma oportunidade encontrada" })).toBeVisible();
    await expect(
      page.getByText(
        "Ou os fluxos já usam modelos econômicos, ou ainda não há volume suficiente de execuções (mínimo 3 por node) nos últimos 30 dias.",
      ),
    ).toBeVisible();
    // Analisado: continua havendo so UM botao "Analisar" (agora o do header).
    await expect(page.getByRole("button", { name: "Analisar", exact: true })).toHaveCount(1);
  });

  test('nav "Otimizador de Custo" leva pra /cost-optimizer', async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/dashboard");

    await page.getByRole("link", { name: "Otimizador de Custo" }).click();
    await expect(page).toHaveURL(/\/cost-optimizer$/);
    // O h1 e o label do menu agora sao o mesmo texto — escopar por
    // heading/level 1 e o que separa o titulo da pagina do link do sidebar.
    await expect(page.getByRole("heading", { level: 1, name: "Otimizador de Custo" })).toBeVisible();
  });
});
