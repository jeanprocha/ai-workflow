import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { CreateCredentialDto } from './dto/create-credential.dto';

/** Metadados publicos de uma credencial — o valor descriptografado nunca sai daqui. */
function toPublic(credential: {
  id: string;
  provider: string;
  name: string;
  lastFour: string | null;
  createdAt: Date;
}) {
  return {
    id: credential.id,
    provider: credential.provider,
    name: credential.name,
    lastFour: credential.lastFour,
    createdAt: credential.createdAt,
  };
}

@Injectable()
export class CredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async list(workspaceId: string) {
    const credentials = await this.prisma.credential.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return credentials.map(toPublic);
  }

  async create(workspaceId: string, dto: CreateCredentialDto) {
    // Nome e a chave de resolucao em TODO consumidor (engine, agents,
    // copilot, debugger, autocomplete resolvem credencial por nome via
    // findFirst) — duplicata tornaria indefinido qual delas e usada.
    // Mesmo padrao de variables.service.ts, com o unique
    // (workspaceId, name) no schema como backstop.
    const existing = await this.prisma.credential.findUnique({
      where: { workspaceId_name: { workspaceId, name: dto.name } },
    });
    if (existing) {
      throw new ConflictException(
        'Ja existe uma conexao com este nome neste workspace.',
      );
    }

    const credential = await this.prisma.credential.create({
      data: {
        workspaceId,
        provider: dto.provider,
        name: dto.name,
        encryptedData: this.crypto.encrypt(dto.value),
        lastFour: dto.value.slice(-4),
      },
    });
    return toPublic(credential);
  }

  async remove(workspaceId: string, id: string) {
    const credential = await this.prisma.credential.findFirst({
      where: { id, workspaceId },
    });
    if (!credential) {
      throw new NotFoundException('Conexao nao encontrada.');
    }
    await this.prisma.credential.delete({ where: { id } });
  }
}
