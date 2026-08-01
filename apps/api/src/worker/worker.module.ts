import { Module } from '@nestjs/common';
import { SentryModule } from '@sentry/nestjs/setup';
import { ObservabilityModule } from '../observability/observability.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CacheModule } from '../cache/cache.module';
import { ExecutionEventsModule } from '../execution-events/execution-events.module';
import { QueueModule } from '../queue/queue.module';
import { EngineModule } from '../engine/engine.module';
import { ExecutionsModule } from '../executions/executions.module';
import { ExecutionsProcessor } from '../executions/executions.processor';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { IngestionProcessor } from '../knowledge/ingestion.processor';
import { McpModule } from '../mcp/mcp.module';
import { McpHealthProcessor } from '../mcp/mcp-health.processor';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { ScheduleProcessor } from '../scheduler/schedule.processor';
import { ApprovalsModule } from '../approvals/approvals.module';
import { ApprovalsSweepProcessor } from '../approvals/approvals-sweep.processor';
import { OrphanRecoveryService } from './orphan-recovery.service';
import { WorkerHeartbeatService } from './worker-heartbeat.service';

/**
 * Processo separado do apps/api (Fase 10, ADR-008): so consome filas, nunca
 * serve HTTP (bootstrap via NestFactory.createApplicationContext em
 * worker.main.ts — sem adapter HTTP, sem porta escutando). As entregas
 * (ExecutionsModule/KnowledgeModule/McpModule/SchedulerModule) continuam sem
 * o Processor em sua propria declaracao — cada Processor e registrado aqui,
 * no worker, para que a API nunca rode jobs no proprio processo. Os
 * controllers dessas modules ainda sao instanciados aqui (efeito colateral de
 * reutilizar os modules), mas isso e inofensivo: sem HTTP no worker, nenhuma
 * rota deles e servida. Metricas de fila ficam expostas pela API
 * (GET /health/queues), nao pelo worker.
 */
@Module({
  imports: [
    SentryModule.forRoot(),
    ObservabilityModule,
    PrismaModule,
    CacheModule,
    ExecutionEventsModule,
    QueueModule,
    EngineModule,
    ExecutionsModule,
    KnowledgeModule,
    McpModule,
    SchedulerModule,
    ApprovalsModule,
  ],
  providers: [
    ExecutionsProcessor,
    IngestionProcessor,
    McpHealthProcessor,
    ScheduleProcessor,
    ApprovalsSweepProcessor,
    OrphanRecoveryService,
    WorkerHeartbeatService,
  ],
})
export class WorkerModule {}
