import { test, expect } from "../../helpers/fixtures";
import { buildTestUser, registerViaApi } from "../../helpers/auth";

test.describe("Login (via UI)", () => {
  test("happy path: entra e cai no dashboard @smoke", async ({ page, request }) => {
    const user = buildTestUser();
    await registerViaApi(request, user);

    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();

    await page.getByLabel("E-mail").fill(user.email);
    await page.getByLabel("Senha").fill(user.password);
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("senha errada mostra 'Email ou senha invalidos.'", async ({ page, request }) => {
    const user = buildTestUser();
    await registerViaApi(request, user);

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(user.email);
    await page.getByLabel("Senha").fill("senha-totalmente-errada");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page.getByText("Email ou senha invalidos.")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("email inexistente mostra a MESMA mensagem (nao revela qual campo errou)", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill("ninguem-registrado@teste.local");
    await page.getByLabel("Senha").fill("qualquer-coisa");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page.getByText("Email ou senha invalidos.")).toBeVisible();
  });

  test("?next= leva de volta pra rota original apos o login", async ({ page, request }) => {
    const user = buildTestUser();
    await registerViaApi(request, user);

    await page.goto("/flows");
    await expect(page).toHaveURL(/\/login\?next=%2Fflows/);

    await page.getByLabel("E-mail").fill(user.email);
    await page.getByLabel("Senha").fill(user.password);
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/\/flows$/);
  });

  test("usuario ja logado visitando /login ou /register e redirecionado ao dashboard", async ({
    page,
    request,
  }) => {
    const user = buildTestUser();
    await registerViaApi(request, user);

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(user.email);
    await page.getByLabel("Senha").fill(user.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/login");
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/register");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("link para registro nao colide com o botao de submit", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("link", { name: "Criar conta" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  });

  test("botao mostra estado de carregamento durante o submit", async ({ page, request }) => {
    const user = buildTestUser();
    await registerViaApi(request, user);

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(user.email);
    await page.getByLabel("Senha").fill(user.password);

    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("button", { name: "Entrando..." })).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
