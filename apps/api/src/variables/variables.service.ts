import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { CreateVariableDto } from './dto/create-variable.dto';

function toPublic(variable: {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
  scope: string;
  createdAt: Date;
}) {
  return {
    id: variable.id,
    key: variable.key,
    value: variable.isSecret ? null : variable.value,
    isSecret: variable.isSecret,
    scope: variable.scope,
    createdAt: variable.createdAt,
  };
}

@Injectable()
export class VariablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async list(workspaceId: string) {
    const variables = await this.prisma.variable.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return variables.map(toPublic);
  }

  async create(workspaceId: string, dto: CreateVariableDto) {
    const existing = await this.prisma.variable.findUnique({
      where: { workspaceId_key: { workspaceId, key: dto.key } },
    });
    if (existing) {
      throw new ConflictException(
        'Ja existe uma variavel com esta chave neste workspace.',
      );
    }

    const variable = await this.prisma.variable.create({
      data: {
        workspaceId,
        key: dto.key,
        value: dto.isSecret ? this.crypto.encrypt(dto.value) : dto.value,
        isSecret: dto.isSecret ?? false,
        scope: dto.scope ?? 'global',
      },
    });
    return toPublic(variable);
  }

  async remove(workspaceId: string, id: string) {
    const variable = await this.prisma.variable.findFirst({
      where: { id, workspaceId },
    });
    if (!variable) {
      throw new NotFoundException('Variavel nao encontrada.');
    }
    await this.prisma.variable.delete({ where: { id } });
  }
}
