import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Logger } from 'nestjs-pino';
import { translateHttpExceptionBody } from '../i18n/lang.filter';
import { getContext } from './request-context';

/**
 * Unico filtro global de excecoes (registrado em main.ts via
 * `app.useGlobalFilters(new AllExceptionsFilter(app.get(Logger)))`). Usa o
 * `Logger` (singleton, mesmo usado em `app.useLogger()`), nao o `PinoLogger`
 * (request-scoped — `app.get()` nao funciona pra providers request-scoped
 * fora de uma request; exigiria `app.resolve()` async, sem sentido aqui).
 * Substitui o antigo par LangExceptionFilter (so HttpException) + o handler
 * default do Nest (que engolia erros nao-HTTP sem log estruturado):
 *
 * - HttpException conhecida (NotFoundException, etc.): aplica a traducao
 *   pt->en de sempre (translateHttpExceptionBody, extraido do antigo
 *   lang.filter.ts, comportamento identico) e loga em `warn` (esperado, nao
 *   e bug) ou `error` se status >= 500.
 * - Qualquer outro erro (bug, driver do Prisma, TypeError, etc.): loga em
 *   `error` com a stack completa e devolve um 500 generico — antes, esses
 *   erros iam pro handler default do Nest sem nenhum log nosso.
 *
 * pt-BR continua default byte-identico (sem x-lang ou x-lang=pt): so o log
 * estruturado e novo, a resposta HTTP para o cliente nao muda.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const route = `${request.method} ${request.url}`;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const lang = request.headers['x-lang'];
      const body = translateHttpExceptionBody(exception.getResponse(), lang);

      if (status >= 500) {
        this.logger.error(
          { err: exception, ctx: getContext(), statusCode: status },
          `${route} -> ${status}`,
        );
      } else {
        this.logger.warn(
          { ctx: getContext(), statusCode: status },
          `${route} -> ${status}`,
        );
      }

      response.status(status).json(body);
      return;
    }

    this.logger.error(
      { err: exception, ctx: getContext() },
      `Unhandled exception on ${route}`,
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Internal Server Error',
    });
  }
}
