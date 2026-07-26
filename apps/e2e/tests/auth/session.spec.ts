import { test, expect } from "../../helpers/fixtures";
import {
  authenticateContext,
  buildTestUser,
  buildStorageState,
  registerViaApi,
} from "../../helpers/auth";

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
    await page.getByLabel("E-mail").fill(user.email);
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
    await authenticateContext(context, storageState, {
      "wf.accessToken": "token.invalido.corrompido",
    });

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
    await authenticateContext(context, storageState, {
      "wf.accessToken": "token.invalido",
      "wf.refreshToken": "refresh.tambem.invalido",
    });

    // waitUntil: "commit" em vez do default "load" — o api-client dispara o
    // redirect client-side pro /login assim que o refresh falha, o que pode
    // acontecer antes do evento "load" da navegacao original, fazendo
    // page.goto() estourar net::ERR_ABORTED esperando um "load" que nao vem.
    await page.goto("/dashboard", { waitUntil: "commit" });

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    const cookie = await page.evaluate(() => document.cookie);
    expect(cookie).not.toContain("wf_session=1");
  });

  test("logout em outra aba: aba com sessao aberta redireciona pro login sozinha (nao trava)", async ({
    page,
    context,
    request,
  }) => {
    const user = buildTestUser();
    const tokens = await registerViaApi(request, user);
    const storageState = await buildStorageState(request, tokens);
    await authenticateContext(context, storageState);

    // /executions tem polling ativo (refetchInterval), como o dashboard —
    // e o cenario onde o bug apareceu: sem esse polling batendo em 401
    // depois da sessao sumir, nada dispara o redirect.
    await page.goto("/executions");
    await expect(page).toHaveURL(/\/executions$/);

    // Localstorage e cookies sao compartilhados entre abas da mesma origem —
    // simula o logout feito em OUTRA aba sem tocar nesta.
    await page.evaluate(() => {
      localStorage.removeItem("wf.accessToken");
      localStorage.removeItem("wf.refreshToken");
      localStorage.removeItem("wf.workspaceId");
      document.cookie = "wf_session=; path=/; max-age=0";
    });

    // Regressao: com ambos os tokens ja ausentes (nao so invalidos), o
    // api-client so tentava recuperar a sessao quando havia refreshToken —
    // sem ele, o 401 do polling era silenciosamente ignorado e a aba ficava
    // presa exibindo dados desatualizados ate um reload manual.
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
  });
});

test.describe("Command palette", () => {
  test("Ctrl+K abre sem crashar e aceita digitacao", async ({ page, context, request }) => {
    const user = buildTestUser();
    const tokens = await registerViaApi(request, user);
    const storageState = await buildStorageState(request, tokens);
    await authenticateContext(context, storageState);

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    // Regressao: CommandDialog nunca envolvia os filhos no <Command> raiz do
    // cmdk, entao CommandInput lia um contexto/store inexistente e derrubava
    // a arvore React inteira ("Cannot read properties of undefined (reading
    // 'subscribe')") a primeira vez que alguem abria o Ctrl+K.
    await page.keyboard.press("Control+k");
    const input = page.getByPlaceholder(/Pesquisar fluxos/);
    await expect(input).toBeVisible();
    await input.fill("teste");

    expect(pageErrors).toEqual([]);
  });
});
