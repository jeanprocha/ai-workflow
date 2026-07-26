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

    await expect(page.getByRole("heading", { level: 1, name: "Cost Optimizer" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ainda nao analisado" })).toBeVisible();
    await expect(
      page.getByText(
        "Clique em Analisar para ver oportunidades reais de economia com base no que os seus fluxos ja rodaram.",
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
        "Ou os fluxos ja usam modelos economicos, ou ainda nao ha volume suficiente de execucoes (minimo 3 por node) nos ultimos 30 dias.",
      ),
    ).toBeVisible();
    // Analisado: continua havendo so UM botao "Analisar" (agora o do header).
    await expect(page.getByRole("button", { name: "Analisar", exact: true })).toHaveCount(1);
  });

  test('nav "Otimizador de Custo" leva pra /cost-optimizer (h1 diferente do label do menu)', async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/dashboard");

    await page.getByRole("link", { name: "Otimizador de Custo" }).click();
    await expect(page).toHaveURL(/\/cost-optimizer$/);
    await expect(page.getByRole("heading", { level: 1, name: "Cost Optimizer" })).toBeVisible();
  });
});
