import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { mergeContext } from './request-context';

/**
 * Interceptor global (registrado em app.module.ts via APP_INTERCEPTOR) —
 * roda depois dos guards (JwtAuthGuard/WorkspaceGuard ja populam
 * request.user/request.workspaceId nesse ponto), enriquecendo o contexto de
 * correlacao aberto pelo request-id.middleware.ts com quem fez a request.
 * Rotas publicas (sem guard de auth) simplesmente nao tem request.user —
 * merge vira no-op pros campos ausentes.
 */
@Injectable()
export class AuthContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;
    const workspaceId = (request as { workspaceId?: string }).workspaceId;

    if (user?.userId || workspaceId) {
      mergeContext({ userId: user?.userId, workspaceId });
    }

    return next.handle();
  }
}
