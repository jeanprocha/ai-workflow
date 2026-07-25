import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { runWithContext } from './request-context';

const REQUEST_ID_HEADER = 'x-request-id';
const TEST_RUN_HEADER = 'x-test-run';
const MAX_HEADER_LEN = 128;

function sanitizeHeader(
  value: string | string[] | undefined,
): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  // Nunca confie cegamente num header vindo do cliente — capa tamanho e
  // caracteres, senao um requestId hostil vira ruido/injecao nos logs.
  return raw.slice(0, MAX_HEADER_LEN).replace(/[^\w.-]/g, '');
}

/**
 * Aplicado via `app.use()` em main.ts (antes de qualquer outro middleware) —
 * abre o contexto de correlacao (AsyncLocalStorage) pra TODA a request,
 * incluindo o auto-logging do pino-http (que so escreve o log no fim da
 * request, dentro desta mesma continuacao async — a ordem de registro do
 * middleware do pino nao importa aqui, o que importa e que o `next()` abaixo
 * roda dentro de `runWithContext`).
 *
 * Le/gera `x-request-id` e devolve no response, pro cliente (e o teste E2E)
 * conseguirem correlacionar. `x-test-run`, quando presente (injetado pelo
 * Playwright — Fase 7), so e propagado, nunca gerado aqui.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const requestId =
    sanitizeHeader(req.headers[REQUEST_ID_HEADER]) ?? randomUUID();
  const testRun = sanitizeHeader(req.headers[TEST_RUN_HEADER]);

  res.setHeader(REQUEST_ID_HEADER, requestId);

  runWithContext({ requestId, testRun }, () => next());
}
