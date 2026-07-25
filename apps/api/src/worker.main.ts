import './load-env';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { WorkerModule } from './worker/worker.module';
import { startWorkerHttpServer } from './observability/worker-http';

/**
 * Entrypoint do worker (Fase 10, ADR-008): mesmo codebase do @workflow/api,
 * processo separado. Sem HTTP — so consome as filas (executions, ingestion,
 * mcp-health, schedules). Deploy independente: `node dist/worker.main.js`
 * (ver apps/api/package.json e docs/deploy/railway.md).
 *
 * Mesmo sem HTTP, o WorkerModule importa ObservabilityModule (via
 * worker.module.ts) — o middleware do nestjs-pino nunca roda (nao ha adapter
 * HTTP), mas o Logger/PinoLogger injetavel funciona igual, entao o worker
 * ganha o mesmo logging estruturado da API.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);

  // app.close() dispara onApplicationShutdown em todos os providers — o
  // BullExplorer do @nestjs/bullmq fecha cada Worker com worker.close(), que
  // por padrao espera o job ativo terminar antes de resolver (drena antes de
  // encerrar, sem descartar execucao em andamento).
  app.enableShutdownHooks();

  const httpServer = startWorkerHttpServer(app);
  const closeHttpServer = () => httpServer.close();
  process.on('SIGTERM', closeHttpServer);
  process.on('SIGINT', closeHttpServer);

  logger.log(
    'Worker iniciado — consumindo filas: executions, ingestion, mcp-health, schedules.',
  );
}

void bootstrap();
