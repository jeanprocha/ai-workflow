import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { SSE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

/**
 * Interceptor global (registrado em app.module.ts via APP_INTERCEPTOR) —
 * so mede requests HTTP normais. Ignora rotas `@Sse()`: a duracao ali e a
 * vida inteira da conexao (nao latencia de um request/response) e o handler
 * emite multiplos `next()` (um por evento), o que inflaria contagem/duracao
 * se caisse no mesmo caminho. Deteccao via metadata do decorator, nao pelo
 * header `Accept` do client — nem o EventSource nem o `fetch` manual usado
 * em `sse-client.ts` mandam `Accept: text/event-stream`, entao aquele check
 * nunca pegava o trafego real do frontend.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(
    private readonly metrics: MetricsService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    if (this.reflector.get<boolean>(SSE_METADATA, context.getHandler())) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = process.hrtime.bigint();

    const record = () => {
      // request.route so existe depois que o Express resolveu a rota — por
      // isso a leitura acontece aqui, no tap (pos-handler), nao antes.
      // Usar o TEMPLATE da rota (ex.: "/workflows/:id/run"), nunca a URL
      // crua, e o que mantem a cardinalidade dos labels sob controle.
      const route =
        (request.route as { path?: string } | undefined)?.path ??
        request.path ??
        'unknown';
      const labels = {
        method: request.method,
        route,
        status: String(response.statusCode),
      };
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
      this.metrics.httpRequestDuration.observe(labels, durationSeconds);
      this.metrics.httpRequestsTotal.inc(labels);
    };

    return next.handle().pipe(tap({ next: record, error: record }));
  }
}
