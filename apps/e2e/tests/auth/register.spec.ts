import { test, expect } from "../../helpers/fixtures";
import { buildTestUser, registerViaApi } from "../../helpers/auth";

test.describe("Registro (via UI)", () => {
  test("happy path: cria conta e cai no dashboard com sessao valida", async ({ page }) => {
    const user = buildTestUser();

    await page.goto("/register");
    await expect(page.getByRole("heading", { name: "Criar conta" })).toBeVisible();

    await page.getByLabel("Nome").fill(user.name);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Senha").fill(user.password);
    await page.getByRole("button", { name: "Criar conta" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);

    // Sessao gravada do jeito que apps/web/src/lib/auth-storage.ts espera.
    const storage = await page.evaluate(() => ({
      accessToken: localStorage.getItem("wf.accessToken"),
      refreshToken: localStorage.getItem("wf.refreshToken"),
      workspaceId: localStorage.getItem("wf.workspaceId"),
      cookie: document.cookie,
    }));
    expect(storage.accessToken).toBeTruthy();
    expect(storage.refreshToken).toBeTruthy();
    expect(storage.workspaceId).toBeTruthy();
    expect(storage.cookie).toContain("wf_session=1");

    // Botao do menu do usuario (UserMenu) mostra a inicial do nome; ao abrir,
    // o dropdown mostra nome e email completos.
    const initial = user.name[0]!.toUpperCase();
    const menuTrigger = page.getByRole("button", { name: initial, exact: true });
    await expect(menuTrigger).toBeVisible();
    await menuTrigger.click();
    await expect(page.getByText(user.name, { exact: true })).toBeVisible();
    await expect(page.getByText(user.email, { exact: true })).toBeVisible();
  });

  test("email duplicado mostra erro inline e permanece em /register", async ({
    page,
    request,
  }) => {
    const user = buildTestUser();
    await registerViaApi(request, user);

    await page.goto("/register");
    await page.getByLabel("Nome").fill(user.name);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Senha").fill(user.password);
    await page.getByRole("button", { name: "Criar conta" }).click();

    await expect(page.getByText("Ja existe uma conta com este email.")).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
  });

  test("senha curta e barrada pela validacao nativa do navegador", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByText("Minimo de 8 caracteres.")).toBeVisible();

    const password = page.getByLabel("Senha");
    await password.fill("123");
    const isTooShort = await password.evaluate(
      (el: HTMLInputElement) => el.validity.tooShort,
    );
    expect(isTooShort).toBe(true);

    // required + minLength do HTML5 impedem o submit — permanece em /register.
    await page.getByLabel("Nome").fill("Usuario Teste");
    await page.getByLabel("Email").fill("nome.curto@teste.local");
    await page.getByRole("button", { name: "Criar conta" }).click();
    await expect(page).toHaveURL(/\/register$/);
  });

  test("email invalido e barrado pela validacao nativa do navegador", async ({ page }) => {
    await page.goto("/register");
    const email = page.getByLabel("Email");
    await email.fill("nao-e-um-email");
    const isTypeMismatch = await email.evaluate(
      (el: HTMLInputElement) => el.validity.typeMismatch,
    );
    expect(isTypeMismatch).toBe(true);
  });

  test("campos vazios impedem o submit (required)", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("button", { name: "Criar conta" }).click();
    await expect(page).toHaveURL(/\/register$/);
  });

  test("botao mostra estado de carregamento durante o submit", async ({ page, request }) => {
    const user = buildTestUser();

    await page.goto("/register");
    await page.getByLabel("Nome").fill(user.name);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Senha").fill(user.password);

    const button = page.getByRole("button", { name: "Criar conta" });
    await button.click();
    await expect(page.getByRole("button", { name: "Criando conta..." })).toBeVisible();

    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("link para login nao colide com o botao de submit", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("link", { name: "Entrar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Criar conta" })).toBeVisible();
  });
});
