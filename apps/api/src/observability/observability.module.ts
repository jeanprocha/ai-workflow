import { Global, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { createLoggerParams } from './logger.config';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { AiTelemetryBridgeService } from './ai-telemetry.bridge';
import { DebugController } from './debug.controller';
import { QueueModule } from '../queue/queue.module';

/**
 * Importado tanto por app.module.ts (API HTTP) quanto por worker.module.ts
 * (worker, sem HTTP) — os dois processos do mesmo codebase (ADR-008) ganham
 * o mesmo logger estruturado e o mesmo MetricsService (cada processo com seu
 * proprio Registry — ver metrics.service.ts). No worker, o middleware HTTP
 * do nestjs-pino e o MetricsController simplesmente nunca rodam (nao ha
 * adapter HTTP) — o worker expoe as METRICAS por um servidor node:http a
 * parte (worker-http.ts), lendo o mesmo MetricsService via app.get().
 */
@Global()
@Module({
  imports: [
    LoggerModule.forRootAsync({ useFactory: createLoggerParams }),
    QueueModule,
  ],
  // DebugController so entra em dev/CI local (OBS_DEBUG_ENDPOINT=1) — nunca
  // registrado em producao. process.env ja esta populado neste ponto: main.ts
  // e worker.main.ts importam load-env.ts ANTES de qualquer outro modulo (ver
  // request-context.ts), e a metadata do @Module() so e avaliada quando esta
  // classe e importada, depois disso.
  controllers: [
    MetricsController,
    ...(process.env.OBS_DEBUG_ENDPOINT === '1' ? [DebugController] : []),
  ],
  providers: [MetricsService, AiTelemetryBridgeService],
  exports: [LoggerModule, MetricsService],
})
export class ObservabilityModule {}
