import { test, expect } from "../../helpers/fixtures";
import {
  API_URL,
  buildTestUser,
  registerViaApi,
  buildStorageState,
  authenticateContext,
} from "../../helpers/auth";
import { fetchWorkspaceId, workspaceHeaders } from "../../helpers/settings";

/**
 * Metodo de credencial OAuth (spec-oauth-credencial.md v1). Exercita o
 * provedor fake registrado so fora de producao (apps/api/src/oauth/
 * providers.ts, `_test`) — precisa de OAUTH_TEST_AUTHORIZE_URL/
 * OAUTH_TEST_TOKEN_URL apontando pro fixture HTTP
 * (apps/e2e/fixtures/oauth-fake-provider.mjs) já rodando ANTES da API
 * subir, porque essas envs sao lidas so no boot do processo.
 *
 * Diferente do fluxo com Mailpit/mcp-echo-server: aqui o "provedor" e um
 * servidor HTTP de verdade, porque o /authorize precisa ser navegavel pelo
 * BROWSER (popup) e o /token precisa ser alcancavel pelo processo da API.
 */
test.describe("Conectar credencial via OAuth (provedor fake)", () => {
  test("conectar: popup completa o fluxo, fecha sozinho, credencial aparece com badge ativo", async ({
    page,
    context,
    request,
  }) => {
    const user = buildTestUser();
    const tokens = await registerViaApi(request, user);
    await authenticateContext(context, await buildStorageState(request, tokens));
    await page.goto("/settings");

    const connectButton = page.getByRole("button", { name: /Conectar.*Provedor de teste/ });
    // Se o botao nao existe, o ambiente nao tem OAUTH_TEST_AUTHORIZE_URL/
    // OAUTH_TEST_TOKEN_URL setadas na API — falha aqui e mais claro que um
    // timeout obscuro esperando o popup.
    await expect(connectButton).toBeVisible();

    const [popup] = await Promise.all([context.waitForEvent("page"), connectButton.click()]);
    await popup.waitForLoadState();

    // O fixture "aprova" na hora e redireciona pro callback da API, que
    // redireciona pro settings — o handler dentro do popup (window.opener
    // existe) avisa a aba original via postMessage e se fecha sozinho.
    await popup.waitForEvent("close", { timeout: 15_000 });

    await expect(page.getByText("Conectado a _test.")).toBeVisible();
    await expect(page.getByText("_test · Conectado via OAuth")).toBeVisible();
    await expect(page.getByText("Ativo")).toBeVisible();

    // O botao de reconectar substitui o de editar pra credencial oauth.
    await expect(page.getByRole("button", { name: "Reconectar _test" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Editar conexão _test" })).toHaveCount(0);
  });

  test("consentimento negado: mesma aba (sem popup) mostra o erro e nao cria credencial", async ({
    page,
    context,
    request,
  }) => {
    const user = buildTestUser();
    const tokens = await registerViaApi(request, user);
    const workspaceId = await fetchWorkspaceId(request, tokens);
    await authenticateContext(context, await buildStorageState(request, tokens));

    const startResponse = await request.post(`${API_URL}/oauth/_test/start`, {
      headers: workspaceHeaders(tokens, workspaceId),
      data: { name: "conexao-negada" },
    });
    expect(startResponse.ok()).toBe(true);
    const { authorizeUrl } = (await startResponse.json()) as { authorizeUrl: string };

    // Navega na MESMA aba (sem window.open) pra exercitar o branch de
    // OAuthReturnHandler que roda sem window.opener — mesmo destino que um
    // usuario chegaria se o navegador bloqueasse o popup.
    const deniedUrl = `${authorizeUrl}&deny=1`;
    await page.goto(deniedUrl);

    await page.waitForURL(/\/settings/);
    await expect(page.getByText("Não foi possível conectar a _test.")).toBeVisible();

    const credentialsResponse = await request.get(`${API_URL}/credentials`, {
      headers: workspaceHeaders(tokens, workspaceId),
    });
    const credentials = (await credentialsResponse.json()) as Array<{ name: string }>;
    expect(credentials.find((c) => c.name === "conexao-negada")).toBeUndefined();
  });
});
