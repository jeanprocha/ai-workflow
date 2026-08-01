// Precisa ser o PRIMEIRO import de main.ts/worker.main.ts — o SDK instrumenta
// automaticamente os modulos que ainda vao ser importados depois deste ponto
// (mesma regra de ordem de load-env.ts, que este arquivo importa primeiro:
// SENTRY_DSN precisa estar em process.env ANTES do Sentry.init rodar).
import './load-env';
import * as Sentry from '@sentry/nestjs';

/**
 * H1.4 (hardening): sem SENTRY_DSN, Sentry.init vira no-op — o proprio SDK
 * fica desabilitado (dev/test local nunca reporta nada por engano, sem
 * precisar de um `if` aqui).
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment:
    process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
  release: process.env.SENTRY_RELEASE,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
});
