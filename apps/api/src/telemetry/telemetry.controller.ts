import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Logger } from 'nestjs-pino';
import { Public } from '../auth/decorators/public.decorator';
import { ReportClientErrorDto } from './dto/report-client-error.dto';

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

/**
 * Rate limit em memoria por IP — endpoint publico (crash de browser pode
 * acontecer ANTES de qualquer autenticacao), entao nao ha usuario/workspace
 * pra limitar por ali. So precisa sobreviver a picos de um client com bug
 * (loop de erro), nao coordenar entre processos: cada instancia da API tem
 * seu proprio contador, e isso e suficiente pro proposito (nao e uma defesa
 * de seguranca, e uma protecao contra flood acidental de log).
 */
const hits = new Map<string, { count: number; windowStartedAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.windowStartedAt > WINDOW_MS) {
    hits.set(ip, { count: 1, windowStartedAt: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly logger: Logger) {}

  /**
   * Crash de browser (window.onerror/unhandledrejection, ver
   * apps/web/src/lib/telemetry.ts) vira log estruturado do servidor — sem
   * isso, um erro de render no client some sem deixar rastro nenhum,
   * inclusive pro Playwright (Fase 7 le esses logs por testRun).
   */
  @Public()
  @Post('client-errors')
  @HttpCode(HttpStatus.NO_CONTENT)
  report(@Body() dto: ReportClientErrorDto, @Req() req: Request): void {
    const ip = req.ip ?? 'unknown';
    if (isRateLimited(ip)) return;

    this.logger.warn(
      {
        kind: dto.kind,
        stack: dto.stack,
        url: dto.url,
        userAgent: dto.userAgent,
        clientRequestId: dto.requestId,
      },
      `client.error: ${dto.message}`,
    );
  }
}
