import type { APIRequestContext } from "@playwright/test";

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

/**
 * Poll simples (sem webhook/push do Mailpit) ate o email de reset de senha
 * chegar, extrai o token bruto direto do corpo texto do email — mesmo link
 * que o usuario clicaria (`{WEB_URL}/reset-password?token=...`).
 *
 * Depende do SMTP_HOST da API estar configurado pro Mailpit
 * (docker-compose.dev.yml, porta 1025) — sem isso, MailerService fica em
 * modo no-op e nenhum email chega aqui (ver docs/deploy/railway.md).
 */
export async function waitForResetToken(
  request: APIRequestContext,
  email: string,
  timeoutMs = 10_000,
): Promise<string> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const search = await request.get(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    if (search.ok()) {
      const result = (await search.json()) as { messages: Array<{ ID: string }> };
      const latest = result.messages[0];
      if (latest) {
        const detail = await request.get(`${MAILPIT_URL}/api/v1/message/${latest.ID}`);
        const body = (await detail.json()) as { Text: string };
        const match = body.Text.match(/token=([a-f0-9]+)/);
        if (match?.[1]) return match[1];
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(
    `Email de reset de senha para ${email} nao chegou no Mailpit em ${timeoutMs}ms — ` +
      "confira se a API subiu com SMTP_HOST apontando pro Mailpit (docker-compose.dev.yml) " +
      "e se o container do mailpit esta de pe.",
  );
}
