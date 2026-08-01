/**
 * `ioredis-mock` no lugar de um Redis real (Fase 10: o limiter e distribuido
 * via Redis de proposito, pra multiplos workers compartilharem o mesmo
 * contador) — sem isso, `getClient()` tentaria abrir uma conexao TCP real
 * pra `redis://localhost:6379` (porta default do ioredis, DIFERENTE da porta
 * 6380 mapeada em docker-compose.dev.yml pro Redis de desenvolvimento deste
 * repo), o que travaria/falharia o teste dependendo do ambiente.
 */
jest.mock('ioredis', () => ({ Redis: jest.requireActual('ioredis-mock') }));

import { acquireProviderSlot, closeRateLimiterConnection } from './rate-limiter';

const ENV_KEYS = [
  'AI_RATE_LIMIT_TESTWINDOW_RPM',
  'AI_RATE_LIMIT_TESTINDEPA_RPM',
  'AI_RATE_LIMIT_TESTINDEPB_RPM',
  'AI_RATE_LIMIT_TESTOVERFLOW_RPM',
];

afterEach(() => {
  closeRateLimiterConnection();
  for (const key of ENV_KEYS) delete process.env[key];
  jest.useRealTimers();
});

describe('acquireProviderSlot', () => {
  it('primeira chamada dentro do limite resolve sem esperar', async () => {
    process.env.AI_RATE_LIMIT_TESTWINDOW_RPM = '5';
    const waited = await acquireProviderSlot('testwindow');
    // Com timers reais, incr/expire no ioredis-mock ainda gastam alguns ms de
    // I/O assincrono de verdade — o que importa e nao ter entrado no loop de
    // polling (250ms+), nao ser exatamente 0.
    expect(waited).toBeLessThan(50);
  });

  it('janela: contador reinicia depois de WINDOW_SECONDS (60s), mesmo apos estourar o limite anterior', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    process.env.AI_RATE_LIMIT_TESTWINDOW_RPM = '1';

    const wait1 = await acquireProviderSlot('testwindow');
    expect(wait1).toBe(0);

    // +61s: nova janela de 60s — o slot usado na janela anterior nao conta.
    jest.setSystemTime(new Date('2026-01-01T00:01:01.000Z'));
    const wait2 = await acquireProviderSlot('testwindow');
    expect(wait2).toBe(0);
  });

  it('providers independentes: o limite de um provider nao consome o slot de outro', async () => {
    process.env.AI_RATE_LIMIT_TESTINDEPA_RPM = '1';
    process.env.AI_RATE_LIMIT_TESTINDEPB_RPM = '1';

    const waitA = await acquireProviderSlot('testindepa');
    const waitB = await acquireProviderSlot('testindepb');

    expect(waitA).toBeLessThan(50);
    expect(waitB).toBeLessThan(50);
  });

  it('estouro: acima do limite fica esperando e lanca apos MAX_WAIT_MS (30s) sem liberar', async () => {
    jest.useFakeTimers();
    // Fixado no INICIO exato de uma janela de 60s — sem isso, o teste e
    // flaky: se o horario real de execucao cair perto do fim de uma janela,
    // avancar 31s cruzaria pra proxima janela e o slot "estourado" liberaria
    // de gracas antes do MAX_WAIT_MS (bug pego rodando o teste de verdade).
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    process.env.AI_RATE_LIMIT_TESTOVERFLOW_RPM = '1';

    await acquireProviderSlot('testoverflow'); // consome o unico slot da janela
    const secondCall = acquireProviderSlot('testoverflow'); // estoura o limite
    const assertion = expect(secondCall).rejects.toThrow(
      'Limite de taxa do provider "testoverflow" excedido (1 req/min). Tente novamente em instantes.',
    );

    // Avanca o relogio falso o suficiente pra passar dos 30s de MAX_WAIT_MS,
    // deixando o loop de polling (setTimeout a cada 250ms) rodar ate desistir.
    await jest.advanceTimersByTimeAsync(31_000);

    await assertion;
  });
});
