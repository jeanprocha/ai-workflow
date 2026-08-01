/**
 * Rate limit em memoria por chave de API — mesmo padrao de
 * chat-rate-limit.ts, com uma correcao: aquele Map nunca faz eviction (cresce
 * pra sempre por IP). Aqui a chave e keyId (finita, ligada a chaves emitidas
 * de verdade, mas ainda assim varrida quando cresce demais). Empilhado sobre
 * o ThrottlerGuard global (100/min por IP pra API inteira) — o global sozinho
 * nao daria pra isolar por chave: um consumidor com 2 chaves dividiria o
 * mesmo teto de IP.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = Number(process.env.FLOW_API_RATE_LIMIT ?? 60);
const MAX_ENTRIES = 5_000;

const hits = new Map<string, { count: number; windowStartedAt: number }>();

export function isFlowApiRateLimited(keyId: string): boolean {
  const now = Date.now();
  if (hits.size > MAX_ENTRIES) {
    for (const [key, entry] of hits) {
      if (now - entry.windowStartedAt > WINDOW_MS) hits.delete(key);
    }
  }
  const entry = hits.get(keyId);
  if (!entry || now - entry.windowStartedAt > WINDOW_MS) {
    hits.set(keyId, { count: 1, windowStartedAt: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}
