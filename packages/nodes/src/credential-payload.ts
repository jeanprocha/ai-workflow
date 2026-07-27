/**
 * Uma Conexao guarda ou um valor unico (token, webhook URL, connection
 * string) ou varios campos chave/valor serializados como objeto JSON — ver
 * `kind` em apps/api/prisma/schema.prisma. `getCredential()` devolve os dois
 * casos como string; quem consome decide como interpretar.
 */

/** Objeto se a credencial for multi-campo; `null` se for um valor unico. */
function tryParseObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Nao e JSON — e um valor unico.
  }
  return null;
}

/**
 * Tolerante: multi-campo vira o objeto; valor unico vira `{ value: <string> }`.
 * Usado pelo node HTTP, onde as duas formas sao legitimas (`{{ $auth.value }}`
 * pra um token simples, `{{ $auth.clientId }}` pra uma conexao de campos).
 */
export function parseCredentialPayload(raw: string): Record<string, unknown> {
  return tryParseObject(raw) ?? { value: raw };
}

/**
 * Estrito: para nodes que SO funcionam com conexao multi-campo (SMTP precisa
 * de host/porta/usuario/senha; Google Drive precisa do JSON da Service
 * Account). Sem isso, apontar esses nodes pra uma conexao de valor unico
 * estourava um `SyntaxError` cru de JSON.parse, que nao diz ao usuario o que
 * fazer.
 */
export function requireCredentialObject(
  raw: string,
  credentialName: string,
  expectedFields: string,
): Record<string, unknown> {
  const parsed = tryParseObject(raw);
  if (!parsed) {
    throw new Error(
      `A conexao "${credentialName}" precisa ter varios campos (${expectedFields}), mas esta salva como um valor unico.`,
    );
  }
  return parsed;
}
