import { All, Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
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

  /**
   * Eco de qualquer metodo — devolve exatamente o que foi recebido (query,
   * headers, body). Alvo local e deterministico pros testes E2E do node
   * api.httpRequest confirmarem URL final/query/headers/assinatura HMAC sem
   * depender de rede externa (Fase Node HTTP white-label).
   */
  @Public()
  @All('echo')
  echo(@Req() req: Request): {
    method: string;
    path: string;
    query: unknown;
    headers: unknown;
    body: unknown;
  } {
    return {
      method: req.method,
      path: req.path,
      query: req.query,
      headers: req.headers,
      body: req.body,
    };
  }
}
