import {
  Injectable,
  type MessageEvent,
  type OnModuleDestroy,
} from '@nestjs/common';
import { EventEmitter } from 'events';
import { Observable } from 'rxjs';
import { Redis } from 'ioredis';
import { getContext } from '../observability/request-context';
import { MetricsService } from '../observability/metrics.service';

const HEARTBEAT_INTERVAL_MS = 15_000;

export type ExecutionEvent =
  | { type: 'execution.started'; executionId: string }
  | { type: 'step.started'; executionId: string; nodeId: string }
  | {
      type: 'step.completed';
      executionId: string;
      nodeId: string;
      status: 'success' | 'failed';
      output?: unknown;
      error?: string;
    }
  | {
      type: 'log.created';
      executionId: string;
      nodeId: string | null;
      level: string;
      event: string;
      payload?: unknown;
    }
  | {
      type: 'execution.completed';
      executionId: string;
      status: 'success' | 'failed';
    }
  | {
      /** H2-06: execucao pausada (waiting_approval) — trata como fim de stream, igual completed. */
      type: 'execution.suspended';
      executionId: string;
      nodeIds: string[];
    };

const CHANNEL_PREFIX = 'execution-events:';

/**
 * Pub/sub via Redis (ADR-003, revisado na Fase 10).
 * O motor de execucao roda no processo do worker; o SSE (`GET /executions/:id/stream`)
 * e servido pelo processo da API. Sem Redis pub/sub, eventos emitidos no worker
 * nunca chegariam aos clientes SSE conectados na API — cada processo mantem sua
 * propria conexao de publisher/subscriber, e o Redis e quem faz a ponte entre eles.
 */
@Injectable()
export class ExecutionEventsService implements OnModuleDestroy {
  private readonly emitter = new EventEmitter();
  private readonly publisher = new Redis(
    process.env.REDIS_URL ?? 'redis://localhost:6379',
  );
  private readonly subscriber = new Redis(
    process.env.REDIS_URL ?? 'redis://localhost:6379',
  );
  private readonly subscribedChannels = new Set<string>();

  constructor(private readonly metrics: MetricsService) {
    this.emitter.setMaxListeners(100);
    this.subscriber.on('message', (channel: string, message: string) => {
      if (!channel.startsWith(CHANNEL_PREFIX)) return;
      const executionId = channel.slice(CHANNEL_PREFIX.length);
      try {
        const event = JSON.parse(message) as ExecutionEvent;
        this.emitter.emit(executionId, event);
      } catch {
        // payload malformado — ignora
      }
    });
  }

  /**
   * Anexa o requestId do contexto atual (aberto pelo processor via
   * runJobInContext, ver observability/request-context.ts) no envelope
   * publicado — sem precisar tocar cada um dos 4 call-sites em
   * engine.service.ts. O cliente SSE (e o debug endpoint da Fase 7) usam
   * isso pra correlacionar o evento com os logs do servidor daquela run.
   */
  emit(event: ExecutionEvent) {
    const requestId = getContext()?.requestId;
    const envelope = requestId ? { ...event, requestId } : event;
    void this.publisher.publish(
      CHANNEL_PREFIX + event.executionId,
      JSON.stringify(envelope),
    );
  }

  subscribe(executionId: string, listener: (event: ExecutionEvent) => void) {
    const channel = CHANNEL_PREFIX + executionId;
    if (!this.subscribedChannels.has(channel)) {
      this.subscribedChannels.add(channel);
      void this.subscriber.subscribe(channel);
    }
    this.emitter.on(executionId, listener);
    return () => {
      this.emitter.off(executionId, listener);
      if (
        this.emitter.listenerCount(executionId) === 0 &&
        this.subscribedChannels.has(channel)
      ) {
        this.subscribedChannels.delete(channel);
        void this.subscriber.unsubscribe(channel);
      }
    };
  }

  /**
   * Heartbeat `ping` a cada 15s: sem eventos de negocio, o cliente nao tem
   * como distinguir stream vivo de conexao morta (proxy/LB pode derrubar
   * silenciosamente). O ping vai dentro do `data` (nao so no `event:` SSE)
   * porque `sse-client.ts` hoje so le a linha `data:` — consumidores atuais
   * (`use-execution-stream`/`use-execution-live`) filtram por `type` exato e
   * ignoram tipos desconhecidos, entao isso e seguro antes da Fase 6 (que vai
   * usar esse ping pra watchdog de reconexao).
   */
  toObservable(executionId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      this.metrics.sseActiveConnections.inc();
      const unsubscribe = this.subscribe(executionId, (event) => {
        subscriber.next({ data: event });
        // H2-06: pausada tambem fecha o stream — sem isso, uma aba aberta
        // numa execucao que vai esperar dias por uma decisao humana
        // manteria a subscription Redis + heartbeat de 15s vivos por dias.
        if (
          event.type === 'execution.completed' ||
          event.type === 'execution.suspended'
        ) {
          subscriber.complete();
        }
      });
      const heartbeat = setInterval(() => {
        subscriber.next({
          data: { type: 'ping', executionId, timestamp: Date.now() },
        });
      }, HEARTBEAT_INTERVAL_MS);
      return () => {
        clearInterval(heartbeat);
        unsubscribe();
        this.metrics.sseActiveConnections.dec();
      };
    });
  }

  onModuleDestroy() {
    this.publisher.disconnect();
    this.subscriber.disconnect();
  }
}
