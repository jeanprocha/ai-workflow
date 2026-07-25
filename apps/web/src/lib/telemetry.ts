const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";
const MAX_REPORTS_PER_WINDOW = 10;
const WINDOW_MS = 60_000;

let windowStartedAt = 0;
let countInWindow = 0;

/** Janela fixa simples (nao deslizante) — so precisa evitar um loop de erro floodar o servidor, nao ser precisa. */
function allowReport(): boolean {
  const now = Date.now();
  if (now - windowStartedAt > WINDOW_MS) {
    windowStartedAt = now;
    countInWindow = 0;
  }
  countInWindow += 1;
  return countInWindow <= MAX_REPORTS_PER_WINDOW;
}

export interface ClientErrorReport {
  kind: "error" | "unhandledrejection";
  message: string;
  stack?: string;
  /** requestId de uma ApiError que causou o crash, se aplicavel — correlaciona com os logs do servidor. */
  requestId?: string;
}

/**
 * Best-effort, nunca lanca: usa fetch cru (nao apiFetch) de proposito — isto
 * roda justamente quando algo ja deu errado, entao nao pode depender do
 * mesmo pipeline de auth/refresh que pode ser a propria causa do problema
 * (evita recursao: erro de rede -> reporta erro -> nova falha de rede -> ...).
 */
export function reportClientError(report: ClientErrorReport): void {
  if (typeof window === "undefined") return;
  if (!allowReport()) return;

  const body = {
    ...report,
    url: window.location.href,
    userAgent: navigator.userAgent,
  };

  fetch(`${API_URL}/telemetry/client-errors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
    keepalive: true,
  }).catch(() => {
    // best-effort — se nem isso funcionar, nao ha mais nada a fazer no client
  });
}

let initialized = false;

/**
 * Captura crashes que NAO passam por um error boundary do React (erros de
 * script fora de render, promises rejeitadas sem .catch) — sem isto, esses
 * casos somem do browser sem deixar rastro nenhum, nem pro Playwright.
 * Idempotente: seguro chamar em toda montagem de <Providers>.
 */
export function initClientTelemetry(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  window.addEventListener("error", (event) => {
    reportClientError({
      kind: "error",
      message: event.message,
      stack: event.error instanceof Error ? event.error.stack : undefined,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason: unknown = event.reason;
    reportClientError({
      kind: "unhandledrejection",
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}
