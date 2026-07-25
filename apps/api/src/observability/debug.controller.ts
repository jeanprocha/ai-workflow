import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { logRingBuffer } from './log-ring-buffer';

/**
 * So registrado no module quando OBS_DEBUG_ENDPOINT=1 (ver
 * observability.module.ts) — nunca em producao. Usado pela fixture do
 * Playwright (Fase 7) pra anexar os logs do servidor ao report de um teste
 * que falhou, filtrados pelo x-test-run daquele teste (Fase 2).
 */
@Controller('debug')
export class DebugController {
  @Public()
  @Get('logs')
  getLogs(
    @Query('testRun') testRun?: string,
    @Query('requestId') requestId?: string,
    @Query('level') level?: string,
  ) {
    return logRingBuffer.query({ testRun, requestId, level });
  }
}
