/**
 * Rate limit em memoria por IP — mesmo padrao de telemetry.controller.ts
 * (unico precedente do repo pra endpoint publico sem auth): nao e uma
 * defesa de seguranca, e uma protecao contra flood acidental (um cliente
 * bugado em loop). Cada instancia da API tem seu proprio contador; nao
 * coordena entre processos.
 *
 * Camada especifica de dominio, NAO substituida pelo ThrottlerGuard global
 * (H1.1, app.module.ts): o global e generico (protege a API inteira contra
 * flood/DoS, limite largo por IP); este e mais apertado (30/min) e devolve
 * mensagem de erro voltada ao visitante do chat. As duas rodam empilhadas —
 * decisao deliberada, nao esquecimento.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;

const hits = new Map<string, { count: number; windowStartedAt: number }>();

export function isChatRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.windowStartedAt > WINDOW_MS) {
    hits.set(ip, { count: 1, windowStartedAt: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}
