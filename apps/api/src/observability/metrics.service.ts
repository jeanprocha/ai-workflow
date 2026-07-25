import { Injectable } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

const HTTP_BUCKETS = [0.01, 0.05, 0.1, 0.3, 1, 3, 10];
const EXECUTION_BUCKETS = [0.1, 0.5, 1, 3, 10, 30, 60, 180];
const STEP_BUCKETS = [0.01, 0.05, 0.1, 0.3, 1, 3, 10, 30];
const WAIT_BUCKETS = [0.01, 0.1, 0.5, 1, 5, 30, 60, 300];
const AI_BUCKETS = [0.1, 0.5, 1, 2, 5, 10, 30, 60];

/**
 * Registry proprio (nao o `register` global do prom-client) — em dev, o
 * `nest start --watch` recarrega este modulo a cada mudanca de arquivo; com
 * o registry global, a segunda instanciacao de uma metrica com o mesmo nome
 * derruba o processo com "AlreadyRegisteredError". Cada processo (API,
 * worker) tem sua propria instancia de MetricsService com seu proprio
 * registry — nao compartilham estado entre si, cada `/metrics` reflete
 * so o processo que respondeu.
 *
 * Labels sempre de domínio fechado (rota template, node_type, provider,
 * status) — nunca IDs, senao a cardinalidade explode.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duracao de requests HTTP, por metodo/rota/status.',
    labelNames: ['method', 'route', 'status'],
    buckets: HTTP_BUCKETS,
    registers: [this.registry],
  });

  readonly httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total de requests HTTP, por metodo/rota/status.',
    labelNames: ['method', 'route', 'status'],
    registers: [this.registry],
  });

  readonly executionTotal = new Counter({
    name: 'execution_total',
    help: 'Total de execucoes de workflow concluidas, por status/trigger.',
    labelNames: ['status', 'trigger'],
    registers: [this.registry],
  });

  readonly executionDuration = new Histogram({
    name: 'execution_duration_seconds',
    help: 'Duracao total de uma execucao de workflow (todos os nodes).',
    labelNames: ['status', 'trigger'],
    buckets: EXECUTION_BUCKETS,
    registers: [this.registry],
  });

  readonly executionTokensTotal = new Counter({
    name: 'execution_tokens_total',
    help: 'Tokens de IA consumidos por execucoes de workflow (nodes ai.*).',
    registers: [this.registry],
  });

  readonly executionCostUsdTotal = new Counter({
    name: 'execution_cost_usd_total',
    help: 'Custo USD de IA consumido por execucoes de workflow (nodes ai.*).',
    registers: [this.registry],
  });

  readonly stepDuration = new Histogram({
    name: 'step_duration_seconds',
    help: 'Duracao de execucao de um node individual, por tipo/status.',
    labelNames: ['node_type', 'status'],
    buckets: STEP_BUCKETS,
    registers: [this.registry],
  });

  readonly stepRetriesTotal = new Counter({
    name: 'step_retries_total',
    help: 'Tentativas de retry de node (alem da primeira), por tipo.',
    labelNames: ['node_type'],
    registers: [this.registry],
  });

  readonly sandboxTimeoutsTotal = new Counter({
    name: 'sandbox_timeouts_total',
    help: 'Nodes que estouraram o timeout/limite de memoria do sandbox.',
    labelNames: ['node_type', 'reason'],
    registers: [this.registry],
  });

  readonly queueJobsTotal = new Counter({
    name: 'queue_jobs_total',
    help: 'Eventos de job do BullMQ (completed/failed/stalled), por fila.',
    labelNames: ['queue', 'event'],
    registers: [this.registry],
  });

  /**
   * Tempo entre o job ficar pronto (job.timestamp) e um worker comecar a
   * processa-lo (job.processedOn) — cobre tanto fila congestionada quanto,
   * pra fila `schedules`, o drift entre o horario previsto do cron e a
   * execucao real (repeatable job: timestamp = quando deveria disparar).
   */
  readonly queueJobWaitSeconds = new Histogram({
    name: 'queue_job_wait_seconds',
    help: 'Tempo de espera de um job entre pronto e processado, por fila.',
    labelNames: ['queue'],
    buckets: WAIT_BUCKETS,
    registers: [this.registry],
  });

  /** Atualizado no momento do scrape (ver metrics.controller.ts), nao continuamente. */
  readonly queueDepth = new Gauge({
    name: 'queue_depth',
    help: 'Numero de jobs por fila/estado, lido no momento do scrape.',
    labelNames: ['queue', 'state'],
    registers: [this.registry],
  });

  readonly sseActiveConnections = new Gauge({
    name: 'sse_active_connections',
    help: 'Conexoes SSE abertas agora (GET /executions/:id/stream).',
    registers: [this.registry],
  });

  // --- IA (declaradas aqui, populadas na Fase 5 via packages/ai/telemetry) ---

  readonly aiCallDuration = new Histogram({
    name: 'ai_call_duration_seconds',
    help: 'Duracao de uma chamada a provider de IA (sem o tempo de espera por rate limit).',
    labelNames: ['provider', 'model', 'operation'],
    buckets: AI_BUCKETS,
    registers: [this.registry],
  });

  readonly aiTokensTotal = new Counter({
    name: 'ai_tokens_total',
    help: 'Tokens consumidos em chamadas de IA, por provider/model/direcao.',
    labelNames: ['provider', 'model', 'direction'],
    registers: [this.registry],
  });

  readonly aiCostUsdTotal = new Counter({
    name: 'ai_cost_usd_total',
    help: 'Custo USD de chamadas de IA, por provider/model.',
    labelNames: ['provider', 'model'],
    registers: [this.registry],
  });

  readonly aiRateLimitWaitSeconds = new Histogram({
    name: 'ai_rate_limit_wait_seconds',
    help: 'Tempo esperando um slot do rate limiter por provider antes da chamada.',
    labelNames: ['provider'],
    buckets: WAIT_BUCKETS,
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }
}
