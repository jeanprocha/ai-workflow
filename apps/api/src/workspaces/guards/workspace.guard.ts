import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';

/**
 * Multi-tenancy (ADR-006): toda rota que usa este guard exige o header
 * `x-workspace-id` e valida que o usuario autenticado e membro do workspace.
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;
    const workspaceId = request.headers['x-workspace-id'] as string | undefined;

    if (!user) {
      throw new ForbiddenException('Usuario nao autenticado.');
    }
    if (!workspaceId) {
      throw new BadRequestException('Header x-workspace-id e obrigatorio.');
    }

    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: user.userId } },
    });

    if (!membership) {
      throw new ForbiddenException('Voce nao tem acesso a este workspace.');
    }

    request.workspaceId = workspaceId;
    request.workspaceRole = membership.role;
    return true;
  }
}
