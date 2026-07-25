import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Locale } from './pt-to-en';

/** Extrai o header `x-lang` da request (default 'pt') — usado pelos prompts de IA. */
export const Lang = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Locale => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.headers['x-lang'] === 'en' ? 'en' : 'pt';
  },
);
