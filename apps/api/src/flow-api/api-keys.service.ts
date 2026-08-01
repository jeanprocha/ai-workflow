import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

const KEY_PREFIX = 'wfk_';

/** Evita gravar lastUsedAt a cada invoke — 1 UPDATE por chave a cada 60s, no maximo. */
const LAST_USED_THROTTLE_MS = 60_000;
const lastUsedWrites = new Map<string, number>();

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Projecao explicita: keyHash nunca sai daqui, nem por spread acidental. */
const SUMMARY_SELECT = {
  id: true,
  name: true,
  lastFour: true,
  createdAt: true,
  lastUsedAt: true,
  revokedAt: true,
} as const;

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertWorkflowInWorkspace(workspaceId: string, workflowId: string) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: workflowId, workspaceId },
      select: { id: true },
    });
    if (!workflow) {
      throw new NotFoundException('Fluxo nao encontrado.');
    }
  }

  async list(workspaceId: string, workflowId: string) {
    await this.assertWorkflowInWorkspace(workspaceId, workflowId);
    return this.prisma.workflowApiKey.findMany({
      where: { workflowId },
      select: SUMMARY_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** `key` (o valor bruto) so existe nesta resposta — nunca mais e recuperavel. */
  async create(workspaceId: string, workflowId: string, dto: CreateApiKeyDto) {
    await this.assertWorkflowInWorkspace(workspaceId, workflowId);
    const raw = KEY_PREFIX + randomBytes(32).toString('hex');
    const created = await this.prisma.workflowApiKey.create({
      data: {
        workflowId,
        name: dto.name,
        keyHash: hashKey(raw),
        lastFour: raw.slice(-4),
      },
      select: SUMMARY_SELECT,
    });
    return { ...created, key: raw };
  }

  async revoke(workspaceId: string, workflowId: string, keyId: string) {
    await this.assertWorkflowInWorkspace(workspaceId, workflowId);
    // updateMany com workflowId no where: chave de outro fluxo nunca e
    // revogada por engano, e count===0 cobre "nao existe" e "ja revogada"
    // com a mesma resposta (nao ha diferenca observavel util pro chamador).
    const { count } = await this.prisma.workflowApiKey.updateMany({
      where: { id: keyId, workflowId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) {
      throw new NotFoundException('Chave de API nao encontrada.');
    }
  }

  /**
   * So o FlowApiKeyGuard chama. Devolve null pra QUALQUER motivo de recusa
   * (prefixo errado, nao encontrada, revogada) — quem usa nao deve
   * diferenciar o motivo, pra nao virar oraculo de enumeracao.
   */
  async resolveRawKey(raw: string): Promise<{ id: string; workflowId: string } | null> {
    if (!raw.startsWith(KEY_PREFIX)) return null;
    const key = await this.prisma.workflowApiKey.findUnique({
      where: { keyHash: hashKey(raw) },
      select: { id: true, workflowId: true, revokedAt: true },
    });
    if (!key || key.revokedAt) return null;
    return { id: key.id, workflowId: key.workflowId };
  }

  /** Fire-and-forget com .catch obrigatorio: sem ele, rejeicao do Prisma vira unhandled rejection e derruba o processo. */
  touchLastUsed(keyId: string): void {
    const now = Date.now();
    const last = lastUsedWrites.get(keyId) ?? 0;
    if (now - last < LAST_USED_THROTTLE_MS) return;
    lastUsedWrites.set(keyId, now);
    void this.prisma.workflowApiKey
      .update({ where: { id: keyId }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
  }
}
