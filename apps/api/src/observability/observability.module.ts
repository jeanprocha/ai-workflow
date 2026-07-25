import { Global, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { createLoggerParams } from './logger.config';

/**
 * Importado tanto por app.module.ts (API HTTP) quanto por worker.module.ts
 * (worker, sem HTTP) — os dois processos do mesmo codebase (ADR-008) ganham
 * o mesmo logger estruturado. No worker, o middleware HTTP do nestjs-pino
 * simplesmente nunca roda (nao ha adapter HTTP), mas o `Logger`/`PinoLogger`
 * injetavel funciona igual, usado via `app.get(Logger)` em ambos os entrypoints.
 */
@Global()
@Module({
  imports: [LoggerModule.forRootAsync({ useFactory: createLoggerParams })],
  exports: [LoggerModule],
})
export class ObservabilityModule {}
