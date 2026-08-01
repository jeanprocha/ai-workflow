import { test, expect } from "../../helpers/fixtures";
import { API_URL, buildTestUser, registerViaApi, loginViaApi } from "../../helpers/auth";
import { waitForResetToken } from "../../helpers/mailpit";

/**
 * Fase H1.5 — reset de senha ponta-a-ponta, lendo o email de verdade pela
 * API HTTP do Mailpit (nao mocka o envio). Precisa da API rodando com
 * SMTP_HOST apontando pro Mailpit local (ver docs/deploy/railway.md) —
 * sem isso, MailerService fica em modo no-op e estes testes falham no
 * timeout de waitForResetToken, nao no assert em si.
 */
test.describe("Reset de senha (via API + Mailpit)", () => {
  test("fluxo completo: forgot-password -> email -> reset -> login com a senha nova", async ({
    request,
  }) => {
    const user = buildTestUser();
    await registerViaApi(request, user);

    const forgot = await request.post(`${API_URL}/auth/forgot-password`, {
      data: { email: user.email },
    });
    expect(forgot.ok()).toBe(true);

    const token = await waitForResetToken(request, user.email);
    const newPassword = "SenhaNovaE2E456";

    const reset = await request.post(`${API_URL}/auth/reset-password`, {
      data: { token, password: newPassword },
    });
    expect(reset.ok()).toBe(true);

    const oldLogin = await request.post(`${API_URL}/auth/login`, {
      data: { email: user.email, password: user.password },
    });
    expect(oldLogin.status()).toBe(401);

    const newLogin = await loginViaApi(request, user.email, newPassword);
    expect(newLogin.accessToken).toBeTruthy();
  });

  test("token de reset e de uso unico: reutilizar o mesmo token -> 400", async ({
    request,
  }) => {
    const user = buildTestUser();
    await registerViaApi(request, user);
    await request.post(`${API_URL}/auth/forgot-password`, { data: { email: user.email } });
    const token = await waitForResetToken(request, user.email);

    const first = await request.post(`${API_URL}/auth/reset-password`, {
      data: { token, password: "PrimeiraTroca123" },
    });
    expect(first.ok()).toBe(true);

    const second = await request.post(`${API_URL}/auth/reset-password`, {
      data: { token, password: "SegundaTroca456" },
    });
    expect(second.status()).toBe(400);
  });

  test("token invalido -> 400", async ({ request }) => {
    const response = await request.post(`${API_URL}/auth/reset-password`, {
      data: { token: "token-que-nao-existe", password: "QualquerSenha123" },
    });
    expect(response.status()).toBe(400);
  });

  test("forgot-password para email inexistente nao vaza (mesma resposta de sucesso)", async ({
    request,
  }) => {
    const response = await request.post(`${API_URL}/auth/forgot-password`, {
      data: { email: "nao-existe-e2e@example.com" },
    });
    expect(response.ok()).toBe(true);
  });
});
