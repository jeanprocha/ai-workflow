import * as Sentry from "@sentry/nextjs";

/**
 * H1.4 (hardening): roda no browser (ver instrumentation.md do Next) — por
 * isso a env var precisa do prefixo NEXT_PUBLIC_ (inlined no bundle no
 * build). DSN do Sentry e feito pra ser publico (nao e segredo), mesmo
 * padrao de NEXT_PUBLIC_API_URL neste app. Sem a env setada, Sentry.init
 * vira no-op.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
  tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
});

// Recomendado pelo proprio SDK (ver aviso de build) — instrumenta troca de
// rota client-side (App Router) como parte do tracing de performance.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
