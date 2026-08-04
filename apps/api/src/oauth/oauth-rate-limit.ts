/**
 * Rate limit em memoria por IP pro callback publico — mesmo padrao de
 * approval-rate-limit.ts. Nao e defesa de seguranca (o state hash de 32
 * bytes ja e o controle de acesso real), e protecao contra flood acidental.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;

const hits = new Map<string, { count: number; windowStartedAt: number }>();

export function isOAuthCallbackRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.windowStartedAt > WINDOW_MS) {
    hits.set(ip, { count: 1, windowStartedAt: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}
