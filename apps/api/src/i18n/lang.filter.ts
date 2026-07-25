import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { translateMessage } from './pt-to-en';

/**
 * Traduz a `message` de excecoes HTTP pra en quando a request manda o header
 * `x-lang: en`. Nao muda nenhum throw-site nos services (que continuam
 * lancando o texto pt-BR literal, igual sempre foi) — so intercepta a
 * resposta na borda e troca a string via pt-to-en.ts. Sem o header, ou com
 * `x-lang: pt` (ou ausente), o comportamento e byte-identico ao NestJS
 * default de sempre.
 *
 * `message` pode ser string (excecoes lancadas pelos services, ex.:
 * "Fluxo nao encontrado.") ou array de strings (erros de validacao do
 * class-validator, que ja vem em ingles por padrao — deixados como estao).
 */
@Catch(HttpException)
export class LangExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();

    const lang = request.headers['x-lang'];
    const body = exception.getResponse();

    if (lang !== 'en' || typeof body !== 'object' || body === null) {
      response.status(status).json(body);
      return;
    }

    const original = body as Record<string, unknown>;
    if (typeof original.message !== 'string') {
      response.status(status).json(body);
      return;
    }

    response.status(status).json({
      ...original,
      message: translateMessage(original.message),
    });
  }
}
