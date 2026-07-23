import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string) {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId },
      include: { workspace: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((membership) => ({
      id: membership.workspace.id,
      name: membership.workspace.name,
      role: membership.role,
      createdAt: membership.workspace.createdAt,
    }));
  }

  async create(userId: string, dto: CreateWorkspaceDto) {
    return this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({ data: { name: dto.name } });
      await tx.workspaceMember.create({
        data: { workspaceId: workspace.id, userId, role: 'owner' },
      });
      return workspace;
    });
  }
}
