import { test, expect } from "@playwright/test";
import { buildTestUser, buildStorageState, registerViaApi } from "../../helpers/auth";

const PROTECTED_ROUTES = [
  "/dashboard",
  "/flows",
  "/agents",
  "/executions",
  "/analytics",
  "/cost-optimizer",
  "/knowledge",
  "/mcp",
  "/templates",
  "/settings",
];

test.describe("Protecao de rotas (deslogado)", () => {
  for (const route of PROTECTED_ROUTES) {
    test(`${route} redireciona para /login?next=${route}`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(
        new RegExp(`/login\\?next=${route.replace(/\//g, "%2F")}$`),
      );
    });
  }
});

test.describe("Sessao", () => {
  test("logout limpa a sessao e volta pra rotas protegidas exige login de novo", async ({
    page,
    request,
  }) => {
    const user = buildTestUser();
    await registerViaApi(request, user);

    await page.goto("/login");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Senha").fill(user.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    const initial = user.name[0]!.toUpperCase();
    await page.getByRole("button", { name: initial, exact: true }).click();
    await page.getByRole("menuitem", { name: "Sair" }).click();

    await expect(page).toHaveURL(/\/login$/);
    const cookie = await page.evaluate(() => document.cookie);
    expect(cookie).not.toContain("wf_session=1");

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  });

  test("access token invalido com refresh valido: renovado automaticamente", async ({
    page,
    context,
    request,
  }) => {
    const user = buildTestUser();
    const tokens = await registerViaApi(request, user);
    const storageState = await buildStorageState(request, tokens);
    await context.addCookies(storageState.cookies);

    // Grava os tokens numa pagina segura (nao-protegida) ANTES de navegar pra
    // rota protegida — se fizermos goto("/dashboard") primeiro, a pagina
    // dispara fetches sem nenhum token no localStorage ainda, cai em 401 sem
    // refreshToken disponivel, e o api-client ja redireciona pro /login
    // (clearSession) antes do teste terminar de montar o cenario.
    await page.goto("/login");
    await page.evaluate((state) => {
      for (const item of state.origins[0]!.localStorage) {
        localStorage.setItem(item.name, item.value);
      }
      localStorage.setItem("wf.accessToken", "token.invalido.corrompido");
    }, storageState);

    await page.goto("/dashboard");

    // A pagina segue autenticada (o api-client fez POST /auth/refresh nos
    // bastidores e repetiu a request original) — sem redirect pro login.
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await expect(async () => {
      const refreshedToken = await page.evaluate(() => localStorage.getItem("wf.accessToken"));
      expect(refreshedToken).not.toBe("token.invalido.corrompido");
      expect(refreshedToken).toBeTruthy();
    }).toPass({ timeout: 5_000 });
  });

  test("access e refresh token invalidos: sessao e derrubada pro login", async ({
    page,
    context,
    request,
  }) => {
    const user = buildTestUser();
    const tokens = await registerViaApi(request, user);
    const storageState = await buildStorageState(request, tokens);
    await context.addCookies(storageState.cookies);

    await page.goto("/login");
    await page.evaluate((state) => {
      for (const item of state.origins[0]!.localStorage) {
        localStorage.setItem(item.name, item.value);
      }
      localStorage.setItem("wf.accessToken", "token.invalido");
      localStorage.setItem("wf.refreshToken", "refresh.tambem.invalido");
    }, storageState);

    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    const cookie = await page.evaluate(() => document.cookie);
    expect(cookie).not.toContain("wf_session=1");
  });
});
