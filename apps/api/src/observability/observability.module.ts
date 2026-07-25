import { Global, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { createLoggerParams } from './logger.config';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
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
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [LoggerModule, MetricsService],
})
export class ObservabilityModule {}
