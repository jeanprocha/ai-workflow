import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import {
  getOAuthProvider,
  listEnabledProviders,
  type OAuthProviderConfig,
} from './providers';

const STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_EXCHANGE_TIMEOUT_MS = 8_000;

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

interface OAuthBlob {
  access_token: string;
  refresh_token: string | null;
  token_type: string;
}

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  private get webUrl(): string {
    return process.env.WEB_URL ?? 'http://localhost:3000';
  }

  private get redirectUri(): string {
    return `${process.env.API_PUBLIC_URL ?? 'http://localhost:3333'}/oauth/callback`;
  }

  listProviders() {
    return listEnabledProviders();
  }

  /**
   * Cria o state e devolve a URL de autorizacao — nunca redireciona (o
   * frontend nao navega fora de apiFetch, entao o start precisa devolver
   * JSON pra quem chamou, autenticado, abrir num popup).
   */
  async start(
    workspaceId: string,
    userId: string,
    provider: string,
    name?: string,
  ): Promise<{ authorizeUrl: string }> {
    const config = getOAuthProvider(provider);
    if (!config) {
      throw new NotFoundException(
        `Provedor OAuth "${provider}" nao esta habilitado.`,
      );
    }

    const credentialName = name?.trim() || provider;

    // Reconectar a MESMA credencial oauth (token expirado/revogado) e
    // permitido — o conflito real e nome colidindo com outro tipo de
    // conexao ou outro provedor.
    const existing = await this.prisma.credential.findUnique({
      where: { workspaceId_name: { workspaceId, name: credentialName } },
    });
    if (
      existing &&
      (existing.kind !== 'oauth' || existing.oauthProvider !== provider)
    ) {
      throw new ConflictException(
        'Ja existe uma conexao com este nome neste workspace.',
      );
    }

    const rawState = randomBytes(32).toString('hex');
    const stateHash = createHash('sha256').update(rawState).digest('hex');

    await this.prisma.oAuthState.create({
      data: {
        stateHash,
        workspaceId,
        userId,
        provider,
        credentialName,
        expiresAt: new Date(Date.now() + STATE_TTL_MS),
      },
    });

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: config.defaultScopes.join(' '),
      state: rawState,
      ...(config.extraAuthorizeParams ?? {}),
    });

    return { authorizeUrl: `${config.authorizeUrl}?${params.toString()}` };
  }

  /**
   * Sempre devolve uma URL de redirect (sucesso ou erro) — nunca lanca.
   * O callback e publico e o unico contrato dele com quem chamou e "pra
   * onde mandar o browser de volta".
   */
  async handleCallback(query: Record<string, string>): Promise<string> {
    const { code, state, error } = query;

    if (error || !code || !state) {
      return this.errorRedirect();
    }

    const stateHash = createHash('sha256').update(state).digest('hex');
    const stateRow = await this.prisma.oAuthState.findUnique({
      where: { stateHash },
    });

    if (!stateRow || stateRow.usedAt || stateRow.expiresAt < new Date()) {
      return this.errorRedirect();
    }

    // Marcado usado ANTES da troca: um state e de uso unico independente do
    // resultado da troca — reter o direito de retry pro mesmo state abriria
    // janela de replay se a troca falhar por motivo transitorio.
    await this.prisma.oAuthState.update({
      where: { id: stateRow.id },
      data: { usedAt: new Date() },
    });

    const config = getOAuthProvider(stateRow.provider);
    if (!config) {
      return this.errorRedirect(stateRow.provider);
    }

    let tokens: TokenResponse;
    try {
      tokens = await this.exchangeCode(config, code);
    } catch (err) {
      this.logger.warn(
        `Falha ao trocar code por token (provider=${stateRow.provider}): ${err instanceof Error ? err.message : String(err)}`,
      );
      return this.errorRedirect(stateRow.provider);
    }

    const existing = await this.prisma.credential.findUnique({
      where: {
        workspaceId_name: {
          workspaceId: stateRow.workspaceId,
          name: stateRow.credentialName,
        },
      },
    });

    const blob = this.buildOAuthBlob(tokens, existing?.encryptedData);
    const encryptedData = this.crypto.encrypt(JSON.stringify(blob));
    const oauthExpiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;
    const oauthScopes = tokens.scope
      ? tokens.scope.split(' ').filter(Boolean)
      : config.defaultScopes;

    await this.prisma.credential.upsert({
      where: {
        workspaceId_name: {
          workspaceId: stateRow.workspaceId,
          name: stateRow.credentialName,
        },
      },
      create: {
        workspaceId: stateRow.workspaceId,
        provider: stateRow.provider,
        name: stateRow.credentialName,
        kind: 'oauth',
        encryptedData,
        oauthProvider: stateRow.provider,
        oauthExpiresAt,
        oauthScopes,
        oauthStatus: 'active',
      },
      update: {
        encryptedData,
        oauthProvider: stateRow.provider,
        oauthExpiresAt,
        oauthScopes,
        oauthStatus: 'active',
        oauthLastError: null,
      },
    });

    return `${this.webUrl}/settings?oauth=ok&provider=${encodeURIComponent(stateRow.provider)}`;
  }

  /** Se a troca nao devolver refresh_token novo (reconexao sem prompt=consent honrado), preserva o antigo. */
  private buildOAuthBlob(
    tokens: TokenResponse,
    existingEncryptedData?: string,
  ): OAuthBlob {
    let refreshToken = tokens.refresh_token ?? null;
    if (!refreshToken && existingEncryptedData) {
      try {
        const previous = JSON.parse(
          this.crypto.decrypt(existingEncryptedData),
        ) as Partial<OAuthBlob>;
        refreshToken = previous.refresh_token ?? null;
      } catch {
        // Credencial anterior nao era um blob oauth valido — segue sem refresh_token.
      }
    }
    return {
      access_token: tokens.access_token,
      refresh_token: refreshToken,
      token_type: tokens.token_type ?? 'Bearer',
    };
  }

  private async exchangeCode(
    config: OAuthProviderConfig,
    code: string,
  ): Promise<TokenResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      TOKEN_EXCHANGE_TIMEOUT_MS,
    );
    try {
      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: this.redirectUri,
          grant_type: 'authorization_code',
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new BadRequestException(
          `Troca de token falhou (${response.status}): ${body.slice(0, 200)}`,
        );
      }
      return (await response.json()) as TokenResponse;
    } finally {
      clearTimeout(timeout);
    }
  }

  private errorRedirect(provider?: string): string {
    const params = new URLSearchParams({ oauth: 'erro' });
    if (provider) params.set('provider', provider);
    return `${this.webUrl}/settings?${params.toString()}`;
  }
}
