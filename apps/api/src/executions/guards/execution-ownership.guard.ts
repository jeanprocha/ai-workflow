import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * So pra rotas @Sse(): o NestJS ja comita os headers (200 + text/event-stream)
 * assim que o handler de uma rota SSE roda, entao um NotFoundException
 * lancado DENTRO do metodo stream() vira um evento "error" no corpo do SSE,
 * nao um 404 de verdade (achado ao vivo pela suite E2E — curl mostrou
 * HTTP/1.1 200 com "event: error / data: Execucao nao encontrada." no
 * corpo). Guards rodam antes dessa maquina de SSE entrar em acao, entao a
 * checagem de posse precisa estar aqui, nao no service.
 */
@Injectable()
export class ExecutionOwnershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const workspaceId = request.workspaceId as string;
    const id = request.params.id as string;

    const execution = await this.prisma.execution.findFirst({
      where: { id, workflow: { workspaceId } },
      select: { id: true },
    });
    if (!execution) {
      throw new NotFoundException('Execucao nao encontrada.');
    }
    return true;
  }
}
