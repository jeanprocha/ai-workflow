#!/usr/bin/env node
/**
 * Provedor OAuth fake pro e2e do metodo de credencial oauth
 * (spec-oauth-credencial.md). Diferente de mcp-echo-server.mjs (stdio,
 * spawnado pela API por servidor MCP criado no teste), este e HTTP: precisa
 * ser alcancavel pelo BROWSER (redirect do /authorize) e pelo PROCESSO DA
 * API (POST /token na troca de code/refresh_token) — por isso roda numa
 * porta fixa e precisa estar de pe ANTES da API subir: OAUTH_TEST_
 * AUTHORIZE_URL/OAUTH_TEST_TOKEN_URL sao lidas do .env no boot do processo
 * (dotenv), nao dinamicamente — editar o .env com a API ja rodando nao tem
 * efeito ate reiniciar.
 *
 * /authorize "aprova" na hora — o e2e nao testa consentimento humano, so o
 * mecanismo de authorization-code. `?deny=1` simula o usuario recusando
 * (caminho de erro). /token aceita authorization_code e refresh_token.
 *
 * node apps/e2e/fixtures/oauth-fake-provider.mjs
 */
import http from "node:http";
import { randomBytes } from "node:crypto";

const PORT = Number(process.env.PORT ?? 4111);
const REFRESH_TOKEN = "fake-refresh-token";

/** code -> usado ou nao (uso unico, molde do state real de oauth_states). */
const issuedCodes = new Map();

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === "/authorize") {
    const redirectUri = url.searchParams.get("redirect_uri");
    const state = url.searchParams.get("state");
    if (!redirectUri || !state) {
      res.writeHead(400).end("faltando redirect_uri ou state");
      return;
    }
    const target = new URL(redirectUri);
    if (url.searchParams.get("deny") === "1") {
      target.searchParams.set("error", "access_denied");
      target.searchParams.set("state", state);
      res.writeHead(302, { Location: target.toString() }).end();
      return;
    }
    const code = randomBytes(16).toString("hex");
    issuedCodes.set(code, { usedAt: null });
    target.searchParams.set("code", code);
    target.searchParams.set("state", state);
    // Google injeta params extras no retorno (authuser, prompt) — reproduz
    // aqui pra provar que o callback (query sem DTO de classe) aguenta.
    target.searchParams.set("authuser", "0");
    target.searchParams.set("prompt", "consent");
    res.writeHead(302, { Location: target.toString() }).end();
    return;
  }

  if (req.method === "POST" && url.pathname === "/token") {
    const raw = await readBody(req);
    const params = new URLSearchParams(raw);
    const grantType = params.get("grant_type");

    if (grantType === "authorization_code") {
      const code = params.get("code");
      const issued = code ? issuedCodes.get(code) : undefined;
      if (!issued || issued.usedAt) {
        json(res, 400, {
          error: "invalid_grant",
          error_description: "code invalido, ja usado ou inexistente",
        });
        return;
      }
      issued.usedAt = Date.now();
      json(res, 200, {
        access_token: `fake-access-${randomBytes(8).toString("hex")}`,
        refresh_token: REFRESH_TOKEN,
        expires_in: 3600,
        token_type: "Bearer",
        scope: "test",
      });
      return;
    }

    if (grantType === "refresh_token") {
      if (params.get("refresh_token") !== REFRESH_TOKEN) {
        json(res, 400, {
          error: "invalid_grant",
          error_description: "refresh_token desconhecido",
        });
        return;
      }
      json(res, 200, {
        access_token: `fake-access-${randomBytes(8).toString("hex")}`,
        expires_in: 3600,
        token_type: "Bearer",
      });
      return;
    }

    json(res, 400, { error: "unsupported_grant_type" });
    return;
  }

  res.writeHead(404).end();
});

server.listen(PORT, () => {
  console.log(`oauth-fake-provider ouvindo em http://localhost:${PORT}`);
});
