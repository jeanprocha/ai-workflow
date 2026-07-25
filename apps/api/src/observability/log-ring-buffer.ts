import pino from 'pino';
import type { DestinationStream } from 'pino';

const MAX_ENTRIES = 2000;

export interface LogQuery {
  testRun?: string;
  requestId?: string;
  /** Filtra por esse nivel OU mais severo (ex.: "warn" tambem traz "error"/"fatal"). */
  level?: string;
}

/**
 * Ultimos ~2000 logs deste processo (API ou worker — cada um tem sua propria
 * instancia, mesma logica de registry por processo da Fase 4). Existe pra
 * dar ao Playwright uma forma de puxar os logs do servidor referentes a um
 * teste especifico (x-test-run, Fase 2) sem precisar de um agregador de logs
 * externo em dev/CI local — so relevante com OBS_DEBUG_ENDPOINT=1 (nunca em
 * producao, ver debug.controller.ts).
 */
class LogRingBuffer {
  private readonly entries: string[] = new Array<string>(MAX_ENTRIES);
  private size = 0;
  private nextIndex = 0;

  write(chunk: string): void {
    this.entries[this.nextIndex] = chunk;
    this.nextIndex = (this.nextIndex + 1) % MAX_ENTRIES;
    this.size = Math.min(this.size + 1, MAX_ENTRIES);
  }

  /** Retorna em ordem cronologica (mais antigo primeiro). */
  query(filter: LogQuery): Record<string, unknown>[] {
    const oldestIndex = this.size < MAX_ENTRIES ? 0 : this.nextIndex;
    const minLevel = filter.level ? levelValue(filter.level) : undefined;

    const results: Record<string, unknown>[] = [];
    for (let i = 0; i < this.size; i++) {
      const raw = this.entries[(oldestIndex + i) % MAX_ENTRIES];
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (filter.testRun && parsed.testRun !== filter.testRun) continue;
      if (filter.requestId && parsed.requestId !== filter.requestId) continue;
      if (
        minLevel !== undefined &&
        typeof parsed.level === 'number' &&
        parsed.level < minLevel
      ) {
        continue;
      }
      results.push(parsed);
    }
    return results;
  }
}

function levelValue(level: string): number | undefined {
  const value = (pino.levels.values as Record<string, number>)[
    level.toLowerCase()
  ];
  return Number.isFinite(value) ? value : undefined;
}

export const logRingBuffer = new LogRingBuffer();

/** DestinationStream minimo — combinado com o destino normal via pino.multistream em logger.config.ts. */
export const logRingBufferStream: DestinationStream = {
  write: (chunk: string) => {
    logRingBuffer.write(chunk);
  },
};
