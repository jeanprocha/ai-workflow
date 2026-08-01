import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiKeysService } from '../api-keys.service';
import { isFlowApiRateLimited } from '../flow-api-rate-limit';

/**
 * Guard das rotas publicas `v1/flows/*` (controller marcado @Public() pra
 * escapar do JwtAuthGuard global). Uma unica mensagem pra ausente/malformada/
 * inexistente/revogada/de-outro-fluxo — diferenciar qualquer um desses casos
 * vira oraculo de enumeracao (mesmo principio de 'Webhook nao encontrado.'
 * em triggerByWebhook).
 */
@Injectable()
export class FlowApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeys: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization ?? '';
    const raw = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

    const key = raw ? await this.apiKeys.resolveRawKey(raw) : null;
    if (!key || key.workflowId !== request.params.workflowId) {
      throw new UnauthorizedException('Chave de API invalida ou revogada.');
    }

    if (isFlowApiRateLimited(key.id)) {
      throw new HttpException(
        'Limite de requisicoes desta chave excedido. Tente novamente em instantes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.apiKeys.touchLastUsed(key.id);
    request.flowApiKey = { id: key.id, workflowId: key.workflowId };
    return true;
  }
}
