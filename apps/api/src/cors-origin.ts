import type { LoggerService } from '@nestjs/common';

/**
 * H1.1 (hardening): origin explicita via `CORS_ORIGINS` (lista separada por
 * virgula) — ver docs/deploy/railway.md e docs/deploy/vercel.md pros valores
 * de producao. Sem a env var configurada, mantem o comportamento aberto
 * (`true`) que ja existia antes do H1.1, com um aviso no boot — evita
 * quebrar producao numa hardening incremental antes do deploy que define a
 * env, ao mesmo tempo em que da o mecanismo pronto pra travar assim que ela
 * for setada.
 */
export function resolveCorsOrigin(logger: LoggerService): boolean | string[] {
  const raw = process.env.CORS_ORIGINS;
  if (raw) {
    return raw
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }
  logger.warn(
    'CORS_ORIGINS nao configurada — CORS permanece aberto (origin: true). ' +
      'Configure antes do proximo deploy de producao (ver docs/deploy/railway.md).',
  );
  return true;
}
