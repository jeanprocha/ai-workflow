import { test, expect } from "@playwright/test";
import { API_URL, buildTestUser, loginViaApi, registerViaApi } from "../../helpers/auth";

test.describe("Auth via API", () => {
  test("POST /auth/register cria conta, workspace e retorna tokens", async ({ request }) => {
    const user = buildTestUser();
    const tokens = await registerViaApi(request, user);

    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();

    const workspacesRes = await request.get(`${API_URL}/workspaces`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(workspacesRes.ok()).toBe(true);
    const workspaces = await workspacesRes.json();
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].name).toBe(`Workspace de ${user.name}`);
    expect(workspaces[0].role).toBe("owner");
  });

  test("POST /auth/register com email duplicado retorna 409", async ({ request }) => {
    const user = buildTestUser();
    await registerViaApi(request, user);

    const response = await request.post(`${API_URL}/auth/register`, { data: user });
    expect(response.status()).toBe(409);
    const body = await response.json();
    expect(body.message).toBe("Ja existe uma conta com este email.");
  });

  test("POST /auth/register com campo extra no body retorna 400 (forbidNonWhitelisted)", async ({
    request,
  }) => {
    const user = buildTestUser();
    const response = await request.post(`${API_URL}/auth/register`, {
      data: { ...user, isAdmin: true },
    });
    expect(response.status()).toBe(400);
  });

  test.describe("validacao de campos no register", () => {
    test("email malformado -> 400", async ({ request }) => {
      const response = await request.post(`${API_URL}/auth/register`, {
        data: { name: "Teste", email: "nao-e-email", password: "SenhaForte123" },
      });
      expect(response.status()).toBe(400);
    });

    test("senha com 7 caracteres -> 400", async ({ request }) => {
      const response = await request.post(`${API_URL}/auth/register`, {
        data: { name: "Teste", email: "teste@teste.local", password: "curta12" },
      });
      expect(response.status()).toBe(400);
    });

    test("nome com 1 caractere -> 400", async ({ request }) => {
      const response = await request.post(`${API_URL}/auth/register`, {
        data: { name: "A", email: "teste2@teste.local", password: "SenhaForte123" },
      });
      expect(response.status()).toBe(400);
    });
  });

  test("POST /auth/login com credenciais corretas retorna tokens", async ({ request }) => {
    const user = buildTestUser();
    await registerViaApi(request, user);

    const tokens = await loginViaApi(request, user.email, user.password);
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
  });

  test("POST /auth/login com senha errada retorna 401", async ({ request }) => {
    const user = buildTestUser();
    await registerViaApi(request, user);

    const response = await request.post(`${API_URL}/auth/login`, {
      data: { email: user.email, password: "senha-errada" },
    });
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.message).toBe("Email ou senha invalidos.");
  });

  test("POST /auth/refresh com refresh token valido retorna novos tokens", async ({
    request,
  }) => {
    const user = buildTestUser();
    const tokens = await registerViaApi(request, user);

    const response = await request.post(`${API_URL}/auth/refresh`, {
      data: { refreshToken: tokens.refreshToken },
    });
    expect(response.ok()).toBe(true);
    const newTokens = await response.json();
    expect(newTokens.accessToken).toBeTruthy();
    expect(newTokens.accessToken.split(".")).toHaveLength(3);
    // Nao comparamos newTokens.accessToken com tokens.accessToken: o JWT e
    // assinado deterministicamente (mesmo payload + `iat` em segundos), entao
    // um register seguido de refresh dentro do mesmo segundo produz tokens
    // byte-identicos sem que nada esteja errado — nao e sinal de bug.
  });

  test("POST /auth/refresh com token invalido retorna 401", async ({ request }) => {
    const response = await request.post(`${API_URL}/auth/refresh`, {
      data: { refreshToken: "isto-nao-e-um-jwt-valido" },
    });
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.message).toBe("Refresh token invalido ou expirado.");
  });

  test("POST /auth/refresh usando um accessToken no lugar do refreshToken retorna 401", async ({
    request,
  }) => {
    const user = buildTestUser();
    const tokens = await registerViaApi(request, user);

    // access e refresh sao assinados com segredos diferentes (JWT_SECRET vs
    // `${JWT_SECRET}.refresh`) — um nao deve ser aceito no lugar do outro.
    const response = await request.post(`${API_URL}/auth/refresh`, {
      data: { refreshToken: tokens.accessToken },
    });
    expect(response.status()).toBe(401);
  });

  test("GET /auth/me com token valido retorna o usuario", async ({ request }) => {
    const user = buildTestUser();
    const tokens = await registerViaApi(request, user);

    const response = await request.get(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.email).toBe(user.email);
    expect(body.name).toBe(user.name);
  });

  test("GET /auth/me sem token retorna 401", async ({ request }) => {
    const response = await request.get(`${API_URL}/auth/me`);
    expect(response.status()).toBe(401);
  });
});
