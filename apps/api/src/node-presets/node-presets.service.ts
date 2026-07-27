import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNodePresetDto } from './dto/create-node-preset.dto';
import { UpdateNodePresetDto } from './dto/update-node-preset.dto';

function toJsonInput(config: unknown): Prisma.InputJsonValue {
  return config as Prisma.InputJsonValue;
}

@Injectable()
export class NodePresetsService {
  constructor(private readonly prisma: PrismaService) {}

  list(workspaceId: string, nodeType?: string) {
    return this.prisma.nodePreset.findMany({
      where: { workspaceId, ...(nodeType ? { nodeType } : {}) },
      orderBy: [{ nodeType: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(workspaceId: string, id: string) {
    const preset = await this.prisma.nodePreset.findFirst({
      where: { id, workspaceId },
    });
    if (!preset) {
      throw new NotFoundException('Predefinicao nao encontrada.');
    }
    return preset;
  }

  async create(workspaceId: string, dto: CreateNodePresetDto) {
    const existing = await this.prisma.nodePreset.findUnique({
      where: {
        workspaceId_nodeType_name: {
          workspaceId,
          nodeType: dto.nodeType,
          name: dto.name,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        'Ja existe uma predefinicao com este nome para este tipo de node.',
      );
    }

    return this.prisma.nodePreset.create({
      data: {
        workspaceId,
        nodeType: dto.nodeType,
        name: dto.name,
        description: dto.description ?? '',
        config: toJsonInput(dto.config),
      },
    });
  }

  async update(workspaceId: string, id: string, dto: UpdateNodePresetDto) {
    await this.findOne(workspaceId, id);
    return this.prisma.nodePreset.update({
      where: { id },
      data: {
        ...(dto.nodeType !== undefined ? { nodeType: dto.nodeType } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.config !== undefined
          ? { config: toJsonInput(dto.config) }
          : {}),
      },
    });
  }

  async remove(workspaceId: string, id: string) {
    await this.findOne(workspaceId, id);
    await this.prisma.nodePreset.delete({ where: { id } });
  }
}
