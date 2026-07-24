import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker/worker.module';

/**
 * Entrypoint do worker (Fase 10, ADR-008): mesmo codebase do @workflow/api,
 * processo separado. Sem HTTP — so consome as filas (executions, ingestion,
 * mcp-health, schedules). Deploy independente: `node dist/worker.main.js`
 * (ver apps/api/package.json e docs/deploy/railway.md).
 */
async function bootstrap() {
  const logger = new Logger('Worker');
  const app = await NestFactory.createApplicationContext(WorkerModule);

  // app.close() dispara onApplicationShutdown em todos os providers — o
  // BullExplorer do @nestjs/bullmq fecha cada Worker com worker.close(), que
  // por padrao espera o job ativo terminar antes de resolver (drena antes de
  // encerrar, sem descartar execucao em andamento).
  app.enableShutdownHooks();

  logger.log(
    'Worker iniciado — consumindo filas: executions, ingestion, mcp-health, schedules.',
  );
}

void bootstrap();
