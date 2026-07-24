import { Global, Module } from '@nestjs/common';
import { ExecutionEventsService } from './execution-events.service';

/**
 * Global: tanto a API (SSE em ExecutionsController) quanto o worker (EngineService)
 * precisam do mesmo servico, cada um na sua propria arvore de DI (Fase 10).
 */
@Global()
@Module({
  providers: [ExecutionEventsService],
  exports: [ExecutionEventsService],
})
export class ExecutionEventsModule {}
