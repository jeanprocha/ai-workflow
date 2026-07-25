import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { CacheService } from '../cache/cache.service';

export const HEARTBEAT_KEY = 'obs:worker:heartbeat';
const INTERVAL_MS = 10_000;
/** 3x o intervalo — tolera uma batida perdida sem marcar o worker como morto. */
const TTL_SECONDS = 30;

export interface WorkerHeartbeat {
  pid: number;
  startedAt: string;
  lastBeatAt: string;
}

/**
 * So registrado em worker.module.ts (nunca na API) — escreve uma chave no
 * Redis a cada 10s com TTL de 30s. GET /health/ready (na API) le essa chave:
 * se ela expirou, o worker esta morto/travado ha mais de ~30s. Reusa a mesma
 * conexao Redis do CacheService (CacheModule e @Global, disponivel nos dois
 * processos sem import extra).
 */
@Injectable()
export class WorkerHeartbeatService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(WorkerHeartbeatService.name);
  private readonly startedAt = new Date().toISOString();
  private timer?: NodeJS.Timeout;

  constructor(private readonly cache: CacheService) {}

  onApplicationBootstrap(): void {
    void this.beat();
    this.timer = setInterval(() => void this.beat(), INTERVAL_MS);
    this.timer.unref();
  }

  private async beat(): Promise<void> {
    const heartbeat: WorkerHeartbeat = {
      pid: process.pid,
      startedAt: this.startedAt,
      lastBeatAt: new Date().toISOString(),
    };
    try {
      await this.cache.set(
        HEARTBEAT_KEY,
        JSON.stringify(heartbeat),
        TTL_SECONDS,
      );
    } catch (error) {
      this.logger.warn(`Falha ao gravar heartbeat no Redis: ${String(error)}`);
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
