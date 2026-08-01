import * as Sentry from "@sentry/nextjs";

/**
 * H1.4 (hardening): hook oficial do Next.js pra observabilidade server-side
 * (ver node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md
 * — este projeto usa Next 16, instrumentation e onRequestError ja estaveis
 * desde a v15, sem flag experimental). So inicializa no runtime Node — edge
 * nao e usado por nenhuma rota/proxy deste app hoje. Sem SENTRY_DSN,
 * Sentry.init vira no-op (SDK desabilitado).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
      release: process.env.SENTRY_RELEASE,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
