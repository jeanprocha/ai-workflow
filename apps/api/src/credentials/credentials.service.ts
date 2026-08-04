import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
// Import de VALOR (nao `import type`): Prisma.JsonNull e usado em runtime pra
// limpar fields_meta quando a conexao volta a ser de valor unico.
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { CacheService } from '../cache/cache.service';
import { getOAuthProvider } from '../oauth/providers';
import {
  exchangeRefreshToken,
  OAuthInvalidGrantError,
} from '../oauth/token-exchange';
import {
  CreateCredentialDto,
  type CredentialFieldDto,
} from './dto/create-credential.dto';
import { UpdateCredentialDto } from './dto/update-credential.dto';

/** Blob que vive dentro de encryptedData quando kind = "oauth" (ver spec-oauth-credencial.md). */
interface OAuthBlob {
  access_token: string;
  refresh_token: string | null;
  token_type: string;
}

/** Renova se faltar menos que isso pra expirar — folga sobre o timeout de troca (8s). */
const OAUTH_REFRESH_SKEW_MS = 120_000;
const OAUTH_LOCK_TTL_SECONDS = 15;
const OAUTH_WAIT_INTERVAL_MS = 250;
const OAUTH_WAIT_MAX_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Metadados publicos de uma credencial — o valor descriptografado nunca sai daqui. */
function toPublic(credential: {
  id: string;
  provider: string;
  name: string;
  kind: string;
  fieldsMeta: Prisma.JsonValue | null;
  lastFour: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: credential.id,
    provider: credential.provider,
    name: credential.name,
    kind: credential.kind,
    // So chave e tipo — nunca valor (ver o comentario do campo em schema.prisma).
    fieldsMeta: credential.fieldsMeta,
    lastFour: credential.lastFour,
    createdAt: credential.createdAt,
    updatedAt: credential.updatedAt,
  };
}

/** O que sai de buildSecretPayload e vai direto pras colunas da tabela. */
interface SecretPayload {
  encryptedData: string;
  lastFour: string | null;
  kind: string;
  fieldsMeta: Prisma.InputJsonValue | typeof Prisma.JsonNull;
}

function coerceFieldValue(
  field: CredentialFieldDto,
): string | number | boolean {
  if (field.type === 'number') {
    const parsed = Number(field.value);
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException(
        `O campo "${field.key}" esta marcado como numero mas nao tem um numero valido.`,
      );
    }
    return parsed;
  }
  if (field.type === 'boolean') return field.value === 'true';
  return field.value;
}

@Injectable()
export class CredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Traduz `{kind, value, fields}` do DTO no que vai pras colunas. Ponto unico
   * onde a diferenca entre conexao de valor unico e multi-campo existe — todo
   * o resto do sistema le apenas `encryptedData` como string opaca (o contrato
   * `getCredential(name): Promise<string>` nao muda por causa disto).
   */
  private buildSecretPayload(dto: {
    kind?: 'secret' | 'fields';
    value?: string;
    fields?: CredentialFieldDto[];
  }): SecretPayload {
    const kind = dto.kind ?? 'secret';

    if (kind === 'fields') {
      const fields = dto.fields ?? [];
      if (fields.length === 0) {
        throw new BadRequestException(
          'Informe pelo menos um campo nesta conexao.',
        );
      }

      const seen = new Set<string>();
      for (const field of fields) {
        const key = field.key.trim();
        if (!key) {
          throw new BadRequestException('Todo campo precisa de um nome.');
        }
        // getPath() em packages/nodes/src/expressions.ts quebra o caminho por
        // ".", entao uma chave com ponto seria inalcancavel por
        // {{ $auth.<chave> }} — barrar na entrada, em vez de deixar o usuario
        // descobrir isso quando a expressao silenciosamente nao resolver.
        if (key.includes('.')) {
          throw new BadRequestException(
            `O nome do campo "${key}" nao pode conter ponto.`,
          );
        }
        if (seen.has(key)) {
          throw new BadRequestException(
            `O campo "${key}" esta repetido nesta conexao.`,
          );
        }
        seen.add(key);
      }

      const payload: Record<string, string | number | boolean> = {};
      for (const field of fields) {
        payload[field.key.trim()] = coerceFieldValue(field);
      }

      return {
        kind,
        encryptedData: this.crypto.encrypt(JSON.stringify(payload)),
        // Mascarar os 4 ultimos chars de um JSON nao diria nada ao usuario —
        // a lista mostra os NOMES dos campos quando kind = "fields".
        lastFour: null,
        fieldsMeta: fields.map((field) => ({
          key: field.key.trim(),
          type: field.type,
        })),
      };
    }

    if (!dto.value) {
      throw new BadRequestException('Informe o valor desta conexao.');
    }
    return {
      kind,
      encryptedData: this.crypto.encrypt(dto.value),
      lastFour: dto.value.slice(-4),
      fieldsMeta: Prisma.JsonNull,
    };
  }

  /**
   * Ponto unico de resolucao de credencial por nome — substitui o decrypt
   * que estava copiado em 7 lugares (engine, agents, agents/tools,
   * autocomplete, debugger, copilot, knowledge). Devolve sempre uma string
   * opaca (o contrato `getCredential(name): Promise<string>` de
   * packages/nodes/src/types.ts nao muda por causa disto).
   *
   * `emptyNameMessage` existe porque os 7 call-sites tinham guardas
   * diferentes pra nome vazio antes desta consolidacao — alguns nenhuma
   * (deixam cair no NotFoundException generico), outros uma mensagem de
   * dominio especifica (400). Preservado aqui pra nao mudar o contrato
   * observavel de nenhum consumidor existente.
   */
  async resolve(
    workspaceId: string,
    name: string,
    opts?: { emptyNameMessage?: string },
  ): Promise<string> {
    if (!name && opts?.emptyNameMessage) {
      throw new BadRequestException(opts.emptyNameMessage);
    }
    const credential = await this.prisma.credential.findFirst({
      where: { workspaceId, name },
    });
    if (!credential) {
      throw new NotFoundException(
        `Credencial "${name}" nao encontrada neste workspace.`,
      );
    }
    if (credential.kind !== 'oauth') {
      return this.crypto.decrypt(credential.encryptedData);
    }
    return this.resolveOAuth(credential);
  }

  /**
   * Token perto de expirar (ou ja expirado) e renovado antes de devolver —
   * o contrato continua "so uma string opaca", entao nenhum node muda.
   * Lock leve (CacheService.acquireLock) evita duas renovacoes concorrentes
   * da mesma credencial invalidarem uma a outra num provedor com refresh-
   * token rotation (Google reusa e invalida o antigo).
   */
  private async resolveOAuth(credential: {
    id: string;
    encryptedData: string;
    oauthProvider: string | null;
    oauthExpiresAt: Date | null;
  }): Promise<string> {
    if (!this.needsOAuthRefresh(credential.oauthExpiresAt)) {
      return this.decryptOAuthBlob(credential.encryptedData).access_token;
    }

    const lockKey = `oauth-refresh:${credential.id}`;
    const lockToken = await this.cache.acquireLock(
      lockKey,
      OAUTH_LOCK_TTL_SECONDS,
    );

    if (!lockToken) {
      const resolved = await this.waitForOAuthRefresh(credential.id);
      if (resolved) return resolved;
      // Ninguem terminou dentro da janela de espera (o dono do lock pode
      // levar ate 8s, a espera aqui e so 5s) — tenta renovar tambem. Nao e
      // Redlock: no raro caso de corrida dupla, uma das duas renovacoes
      // pode falhar e marcar a credencial como erro, exigindo reconexao.
    }

    try {
      return await this.refreshOAuthCredential(credential);
    } finally {
      if (lockToken) await this.cache.releaseLock(lockKey, lockToken);
    }
  }

  private needsOAuthRefresh(expiresAt: Date | null): boolean {
    if (!expiresAt) return false;
    return expiresAt.getTime() - Date.now() < OAUTH_REFRESH_SKEW_MS;
  }

  private decryptOAuthBlob(encryptedData: string): OAuthBlob {
    return JSON.parse(this.crypto.decrypt(encryptedData)) as OAuthBlob;
  }

  /** Espera curta por quem tem o lock terminar, relendo o banco — nao reimplementa a renovacao. */
  private async waitForOAuthRefresh(
    credentialId: string,
  ): Promise<string | null> {
    const deadline = Date.now() + OAUTH_WAIT_MAX_MS;
    while (Date.now() < deadline) {
      await sleep(OAUTH_WAIT_INTERVAL_MS);
      const fresh = await this.prisma.credential.findUnique({
        where: { id: credentialId },
      });
      if (!fresh) return null;
      if (fresh.oauthStatus === 'error') {
        throw new BadRequestException(
          fresh.oauthLastError ??
            'Conexao oauth com erro — reconecte em Configuracoes.',
        );
      }
      if (!this.needsOAuthRefresh(fresh.oauthExpiresAt)) {
        return this.decryptOAuthBlob(fresh.encryptedData).access_token;
      }
    }
    return null;
  }

  private async refreshOAuthCredential(credential: {
    id: string;
    encryptedData: string;
    oauthProvider: string | null;
  }): Promise<string> {
    const blob = this.decryptOAuthBlob(credential.encryptedData);
    if (!blob.refresh_token) {
      throw new BadRequestException(
        'Conexao oauth sem refresh_token — reconecte em Configuracoes.',
      );
    }

    const config = getOAuthProvider(credential.oauthProvider ?? '');
    if (!config) {
      throw new BadRequestException(
        `Provedor OAuth "${credential.oauthProvider}" nao esta mais habilitado.`,
      );
    }

    let tokens: Awaited<ReturnType<typeof exchangeRefreshToken>>;
    try {
      tokens = await exchangeRefreshToken(config, blob.refresh_token);
    } catch (error) {
      if (error instanceof OAuthInvalidGrantError) {
        await this.prisma.credential.update({
          where: { id: credential.id },
          data: { oauthStatus: 'error', oauthLastError: error.message },
        });
        throw new BadRequestException(
          'Conexao oauth expirada ou revogada — reconecte em Configuracoes.',
        );
      }
      // Falha transitoria (rede, timeout, 5xx): nao marca a credencial como
      // erro — um blip nao deveria exigir reconexao manual.
      throw error;
    }

    const newBlob: OAuthBlob = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? blob.refresh_token,
      token_type: tokens.token_type ?? blob.token_type,
    };
    const encryptedData = this.crypto.encrypt(JSON.stringify(newBlob));
    const oauthExpiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    await this.prisma.credential.update({
      where: { id: credential.id },
      data: {
        encryptedData,
        oauthExpiresAt,
        oauthStatus: 'active',
        oauthLastError: null,
      },
    });

    return newBlob.access_token;
  }

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

    const secret = this.buildSecretPayload(dto);
    const credential = await this.prisma.credential.create({
      data: {
        workspaceId,
        provider: dto.provider,
        name: dto.name,
        ...secret,
      },
    });
    return toPublic(credential);
  }

  async update(workspaceId: string, id: string, dto: UpdateCredentialDto) {
    const credential = await this.prisma.credential.findFirst({
      where: { id, workspaceId },
    });
    if (!credential) {
      throw new NotFoundException('Conexao nao encontrada.');
    }

    if (dto.name && dto.name !== credential.name) {
      const conflict = await this.prisma.credential.findUnique({
        where: { workspaceId_name: { workspaceId, name: dto.name } },
      });
      if (conflict) {
        throw new ConflictException(
          'Ja existe uma conexao com este nome neste workspace.',
        );
      }
    }

    // O segredo so e reescrito quando o cliente manda value/fields — sem
    // isso, este PATCH so renomeia/troca o provider e o encryptedData atual
    // fica intacto. Nao existe atualizacao parcial de um campo isolado: o
    // valor salvo nunca volta pro cliente, entao nao ha o que mesclar.
    const replacingSecret = dto.value !== undefined || dto.fields !== undefined;
    const secret = replacingSecret
      ? this.buildSecretPayload({
          kind: dto.kind ?? (credential.kind as 'secret' | 'fields'),
          value: dto.value,
          fields: dto.fields,
        })
      : null;

    const updated = await this.prisma.credential.update({
      where: { id },
      data: {
        ...(dto.provider !== undefined ? { provider: dto.provider } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(secret ?? {}),
      },
    });
    return toPublic(updated);
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
