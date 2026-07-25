import { test as base, expect, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";

const API_URL = process.env.E2E_API_URL ?? "http://localhost:3333";
const WORKER_URL = process.env.E2E_WORKER_URL ?? "http://localhost:3334";

async function attachServerLogs(
  testInfo: TestInfo,
  baseUrl: string,
  filename: string,
  testRun: string,
): Promise<void> {
  try {
    const response = await fetch(
      `${baseUrl}/debug/logs?testRun=${encodeURIComponent(testRun)}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) return;
    const logs = await response.json();
    await testInfo.attach(filename, {
      body: JSON.stringify(logs, null, 2),
      contentType: "application/json",
    });
  } catch {
    // /debug/logs indisponivel (OBS_DEBUG_ENDPOINT != 1, ou servidor fora) —
    // nao falha o teste so porque o diagnostico extra nao pode ser anexado.
  }
}

/**
 * Extensao da suite (Fase 7): correlaciona cada teste com os logs do
 * servidor (x-test-run, Fase 2) e captura o que aconteceu no browser, pra
 * quando um teste falha nao virar so "expect recebeu X" sem contexto nenhum
 * do que o servidor via API/worker estava fazendo naquele momento.
 */
export const test = base.extend<{ testRun: string }>({
  testRun: async ({}, use, testInfo) => {
    const slug = testInfo.titlePath
      .join("_")
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .slice(0, 80);
    await use(`${slug}-${randomUUID().slice(0, 8)}`);
  },

  page: async ({ page, testRun }, use, testInfo) => {
    // addInitScript roda antes de qualquer JS da propria pagina — api-client.ts
    // le window.__E2E_TEST_RUN__ e manda como header x-test-run em toda request.
    await page.addInitScript((value) => {
      (window as unknown as { __E2E_TEST_RUN__?: string }).__E2E_TEST_RUN__ = value;
    }, testRun);

    const consoleMessages: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];

    page.on("console", (msg) => {
      consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
    });
    page.on("pageerror", (error) => {
      pageErrors.push(error.stack ?? error.message);
    });
    page.on("requestfailed", (request) => {
      failedRequests.push(
        `${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "erro desconhecido"}`,
      );
    });

    await use(page);

    if (testInfo.status === testInfo.expectedStatus) return;

    if (consoleMessages.length) {
      await testInfo.attach("browser-console.json", {
        body: JSON.stringify(consoleMessages, null, 2),
        contentType: "application/json",
      });
    }
    if (pageErrors.length) {
      await testInfo.attach("browser-page-errors.json", {
        body: JSON.stringify(pageErrors, null, 2),
        contentType: "application/json",
      });
    }
    if (failedRequests.length) {
      await testInfo.attach("browser-requests-failed.json", {
        body: JSON.stringify(failedRequests, null, 2),
        contentType: "application/json",
      });
    }

    await attachServerLogs(testInfo, API_URL, "server-logs-api.json", testRun);
    await attachServerLogs(testInfo, WORKER_URL, "server-logs-worker.json", testRun);
  },
});

export { expect };
