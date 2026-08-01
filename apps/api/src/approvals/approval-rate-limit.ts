/**
 * Rate limit em memoria por IP — mesmo padrao de chat-rate-limit.ts. Nao e
 * defesa de seguranca (o token de 32 bytes ja e o controle de acesso real),
 * e protecao contra flood acidental (um cliente de e-mail que faz preview
 * batendo o GET em loop, um usuario clicando o botao repetidas vezes).
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;

const hits = new Map<string, { count: number; windowStartedAt: number }>();

export function isApprovalRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.windowStartedAt > WINDOW_MS) {
    hits.set(ip, { count: 1, windowStartedAt: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}
