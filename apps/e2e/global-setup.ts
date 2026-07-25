import fs from "node:fs";
import path from "node:path";

/**
 * Não sobe/derruba os dev servers (o usuário roda `pnpm dev` no próprio
 * terminal — ver docs/testing/plano-de-testes.md). Só confirma que api/web
 * estão de pé antes de rodar a suíte, com uma mensagem de erro clara em vez
 * de cada teste falhando com "connection refused" sem contexto.
 */
async function checkUrl(url: string, label: string): Promise<void> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok && res.status !== 307 && res.status !== 308) {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (error) {
    throw new Error(
      `\n\n${label} nao esta respondendo em ${url} (${(error as Error).message}).\n` +
        "Suba o ambiente antes de rodar a suite:\n" +
        "  1) docker compose -f docker-compose.dev.yml up -d\n" +
        "  2) pnpm --filter @workflow/api dev\n" +
        "  3) pnpm --filter @workflow/web dev\n",
    );
  }
}

function readNextPublicApiUrl(): string | null {
  try {
    const envPath = path.join(__dirname, "../web/.env");
    const content = fs.readFileSync(envPath, "utf-8");
    const match = content.match(/^NEXT_PUBLIC_API_URL\s*=\s*["']?([^"'\n]+)/m);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export default async function globalSetup() {
  const apiUrl = process.env.E2E_API_URL ?? "http://localhost:3333";
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

  await checkUrl(`${apiUrl}/health`, "A API (apps/api)");
  await checkUrl(`${baseUrl}/login`, "O frontend (apps/web)");

  // O browser usa NEXT_PUBLIC_API_URL (baked em build/dev time no processo do
  // Next.js), nao E2E_API_URL — se divergir, testes guiados por UI batem numa
  // URL diferente da que os helpers de API usam. So avisa, nao falha.
  const bakedApiUrl = readNextPublicApiUrl();
  if (bakedApiUrl && bakedApiUrl !== apiUrl) {
    console.warn(
      `\n[e2e] Aviso: apps/web/.env aponta NEXT_PUBLIC_API_URL=${bakedApiUrl}, ` +
        `mas os testes de API usam ${apiUrl}. Se o dev server do web foi ` +
        `iniciado com esse valor, os testes guiados por UI vao bater em ` +
        `${bakedApiUrl}, nao em localhost. Ajuste apps/web/.env pra localhost ` +
        "e reinicie `pnpm --filter @workflow/web dev` se os testes de UI falharem.\n",
    );
  }
}
