/**
 * Fonte unica dos tipos de erro do frontend. `errorMessage()` centraliza uma
 * funcao que existia duplicada em ~12 paginas (cada uma com sua propria copia
 * identica). ApiError mora aqui (nao em api-client.ts) pra evitar import
 * circular: api-client.ts precisa de NetworkError/TimeoutError (definidos
 * aqui) e varias paginas importam ApiError de "@/lib/api-client" — esse
 * arquivo so reexporta ApiError, o import dos consumidores nao muda.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    /** Mesmo valor enviado no header x-request-id — correlaciona com os logs do servidor (GET /debug/logs). */
    public requestId?: string,
  ) {
    super(
      typeof body === "object" && body && "message" in body
        ? String((body as { message: unknown }).message)
        : "Erro na API",
    );
  }
}

/** fetch rejeitou antes de qualquer resposta (offline, DNS, CORS, conexao recusada). */
export class NetworkError extends Error {
  constructor(public cause?: unknown) {
    super("Falha de rede — verifique sua conexao.");
  }
}

/** A requisicao excedeu o timeout (ver api-client.ts) e foi cancelada. */
export class TimeoutError extends Error {
  constructor() {
    super("A requisicao demorou demais e foi cancelada.");
  }
}

/** `error instanceof ApiError ? error.message : fallback` — antes duplicada em ~12 paginas. */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof NetworkError) return error.message;
  if (error instanceof TimeoutError) return error.message;
  return fallback;
}
