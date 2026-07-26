import { test, expect } from "../../helpers/fixtures";
import { authenticateContext, buildTestUser, buildStorageState, registerViaApi } from "../../helpers/auth";

test.describe("Idioma (i18n)", () => {
  test("seletor em /settings troca pra ingles, reflete na UI e persiste apos reload", async ({
    page,
    context,
    request,
  }) => {
    const user = buildTestUser();
    const tokens = await registerViaApi(request, user);
    const storageState = await buildStorageState(request, tokens);
    await authenticateContext(context, storageState);

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Configurações", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Conexões", exact: true })).toBeVisible();

    const langSelect = page.getByLabel("Idioma");
    await expect(langSelect).toBeVisible();
    await langSelect.selectOption("en");

    // UI inteira reage: pagina atual, sidebar/nav e o atributo <html lang>.
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Connections", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Flows" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en-US");

    await page.reload();
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en-US");

    // Volta pra pt (default da plataforma) e confirma que reverte por completo.
    await page.getByLabel("Language").selectOption("pt");
    await expect(page.getByRole("heading", { name: "Configurações", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  });

  test("pt-BR continua sendo o idioma padrao pra uma sessao nova", async ({
    page,
    context,
    request,
  }) => {
    const user = buildTestUser();
    const tokens = await registerViaApi(request, user);
    const storageState = await buildStorageState(request, tokens);
    await authenticateContext(context, storageState);

    await page.goto("/dashboard");
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
    await expect(page.getByRole("link", { name: "Fluxos" })).toBeVisible();
  });
});
