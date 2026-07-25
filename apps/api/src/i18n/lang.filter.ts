import { translateMessage } from './pt-to-en';

/**
 * Traduz o body de uma excecao HTTP (`{statusCode, message, error}` ou
 * variantes) pra en quando a request manda o header `x-lang: en`. Nao muda
 * nenhum throw-site nos services (que continuam lancando o texto pt-BR
 * literal, igual sempre foi) — so troca a string na borda. Sem o header, ou
 * com `x-lang: pt` (ou ausente), devolve o body intocado — comportamento
 * byte-identico ao NestJS default de sempre.
 *
 * `message` pode ser string (excecoes lancadas pelos services, ex.:
 * "Fluxo nao encontrado.") ou array de strings (erros de validacao do
 * class-validator, que ja vem em ingles por padrao — deixados como estao).
 *
 * Usado por AllExceptionsFilter (apps/api/src/observability/all-exceptions.filter.ts),
 * o unico filtro global registrado em main.ts/worker.main.ts.
 */
export function translateHttpExceptionBody(
  body: unknown,
  lang: string | string[] | undefined,
): unknown {
  if (lang !== 'en' || typeof body !== 'object' || body === null) return body;

  const original = body as Record<string, unknown>;
  if (typeof original.message !== 'string') return body;

  return { ...original, message: translateMessage(original.message) };
}
