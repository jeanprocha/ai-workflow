import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
// Import de VALOR (nao `import type`): Prisma.DbNull e usado em runtime pra
// zerar as colunas legadas em claro depois de criptografar.
import { Prisma } from '@prisma/client';
import {
  callMcpTool,
  connectMcpServer,
  listMcpTools,
  type McpConnectionConfig,
} from '@workflow/ai';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { ConnectMcpServerDto } from './dto/connect-mcp-server.dto';

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : (value as Prisma.InputJsonValue);
}

/** Evita importar o tipo Client direto do SDK — dual package hazard (ESM/CJS geram tipos nominais distintos). */
type McpClient = Awaited<ReturnType<typeof connectMcpServer>>;

/** Qual dos dois mapas de segredo de um servidor: env (stdio) ou headers (sse/http). */
type SecretField = 'env' | 'headers';

/**
 * As quatro colunas de segredo de um McpServer: as criptografadas (ADR-007) e
 * as legadas em claro, que existem so ate o backfill do boot passar.
 */
interface McpSecretColumns {
  envEncrypted: string | null;
  headersEncrypted: string | null;
  env: Prisma.JsonValue | null;
  headers: Prisma.JsonValue | null;
}

/** Registro cru como sai do Prisma nas rotas que devolvem servidor. */
type McpServerRow = Prisma.McpServerGetPayload<{ include: { tools: true } }>;

function asStringMap(value: Prisma.JsonValue | null): Record<string, string> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, string>)
    : {};
}

@Injectable()
export class McpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(McpService.name);
  /** Conexoes vivas no processo (ADR-005: worker single-process, ver Fase 6). */
  private readonly clients = new Map<string, McpClient>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async list(workspaceId: string) {
    const servers = await this.prisma.mcpServer.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: { tools: true },
    });
    return servers.map((server) => this.toPublic(server));
  }

  async findOne(workspaceId: string, id: string) {
    return this.toPublic(await this.getOwned(workspaceId, id));
  }

  async connect(workspaceId: string, dto: ConnectMcpServerDto) {
    const server = await this.prisma.mcpServer.create({
      data: {
        workspaceId,
        name: dto.name,
        transport: dto.transport,
        command: dto.command,
        args: toJson(dto.args),
        url: dto.url,
        // env/headers nunca sao gravados em claro (ADR-007) — as colunas Json
        // homonimas so existem para os registros anteriores a esta mudanca.
        envEncrypted: this.encryptMap(dto.env),
        headersEncrypted: this.encryptMap(dto.headers),
        status: 'connecting',
      },
    });

    await this.establishConnection(server.id);
    return this.findOne(workspaceId, server.id);
  }

  async reconnect(workspaceId: string, id: string) {
    await this.getOwned(workspaceId, id);
    await this.establishConnection(id);
    return this.findOne(workspaceId, id);
  }

  async disconnect(workspaceId: string, id: string) {
    await this.getOwned(workspaceId, id);
    await this.closeClient(id);
    await this.prisma.mcpServer.update({
      where: { id },
      data: { status: 'disconnected' },
    });
  }

  async remove(workspaceId: string, id: string) {
    await this.getOwned(workspaceId, id);
    await this.closeClient(id);
    await this.prisma.mcpServer.delete({ where: { id } });
  }

  async callTool(
    workspaceId: string,
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ) {
    await this.getOwned(workspaceId, serverId);
    // Conectividade primeiro: um servidor nunca conectado tem `tools: []`
    // persistido, entao checar o nome da tool ANTES disso faria qualquer
    // chamada nele devolver "tool nao encontrada" — mensagem enganosa que
    // esconde o problema real (servidor inalcancavel). ensureConnected lanca
    // 400 nesse caso.
    const client = await this.ensureConnected(serverId);
    // Re-busca depois de conectar: se a conexao era lazy (server estava
    // disconnected), establishConnection acabou de atualizar as tools
    // persistidas — o `getOwned` de cima poderia estar desatualizado.
    const server = await this.getOwned(workspaceId, serverId);
    // O SDK devolve um JSON-RPC error generico (McpError) pra tool
    // desconhecida, que nao e HttpException e virava 500 — checar contra as
    // tools persistidas primeiro devolve um 404 de verdade.
    if (!server.tools.some((tool) => tool.name === toolName)) {
      throw new NotFoundException(
        `Tool "${toolName}" nao encontrada neste servidor MCP.`,
      );
    }
    return callMcpTool(client, toolName, args);
  }

  /**
   * Job repeatable (fila mcp-health), consumido pelo worker (ADR-008: worker
   * so processa filas, API nunca roda jobs — sao processos separados). As
   * conexoes vivas (`this.clients`) sao estado em memoria do processo que
   * fez o connect/reconnect (sempre a API, ja que so ela serve HTTP) — nesse
   * processo (o worker) `this.clients` nunca tem essas entradas, entao
   * confiar nela aqui marcaria TODO servidor conectado como "disconnected"
   * no primeiro tick, mesmo saudavel. Em vez disso, o health check faz uma
   * sondagem propria (conecta, lista tools, fecha) direto a partir da config
   * persistida — funciona igual em qualquer processo e testa conectividade
   * de verdade, nao um cache que pode estar morto silenciosamente.
   */
  async healthCheckAll(): Promise<void> {
    const servers = await this.prisma.mcpServer.findMany({
      where: { status: 'connected' },
    });

    for (const server of servers) {
      try {
        const probe = await connectMcpServer(
          this.buildConnectionConfig(server),
        );
        try {
          await probe.listTools();
        } finally {
          await probe.close().catch(() => undefined);
        }
        await this.prisma.mcpServer.update({
          where: { id: server.id },
          data: { lastCheckedAt: new Date() },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.closeClient(server.id);
        await this.prisma.mcpServer.update({
          where: { id: server.id },
          data: {
            status: 'error',
            lastError: message,
            lastCheckedAt: new Date(),
          },
        });
      }
    }
  }

  async onModuleInit(): Promise<void> {
    await this.encryptLegacySecrets();
  }

  /**
   * Backfill dos registros gravados antes do ADR-007 valer aqui: eles ainda
   * tem env/headers em claro nas colunas Json. Nao da pra fazer isso em SQL na
   * migration — a chave de criptografia vive na aplicacao —, entao roda no
   * boot da API e do worker. E idempotente (so pega linha com coluna legada
   * nao-nula, e nao reescreve o que ja tem ciphertext), entao os dois
   * processos subindo juntos nao se atrapalham.
   *
   * O try/catch protege contra chave ERRADA (o ciphertext antigo nao abre) e
   * contra erro de banco: nesses casos o boot segue e a leitura ainda cai no
   * fallback em claro ate o proximo boot dar certo. Ele NAO protege contra
   * chave AUSENTE — o CryptoService lanca no proprio construtor
   * (crypto.service.ts:20-26), a DI do Nest aborta e o processo nem chega
   * aqui. Sem SECRETS_ENCRYPTION_KEY a API simplesmente nao sobe, igual ja
   * acontece com credenciais e variaveis.
   */
  private async encryptLegacySecrets(): Promise<void> {
    try {
      const pending = await this.prisma.mcpServer.findMany({
        where: {
          OR: [
            { env: { not: Prisma.DbNull } },
            { headers: { not: Prisma.DbNull } },
          ],
        },
        select: {
          id: true,
          env: true,
          headers: true,
          envEncrypted: true,
          headersEncrypted: true,
        },
      });
      if (pending.length === 0) return;

      let migrated = 0;
      for (const server of pending) {
        try {
          await this.prisma.mcpServer.update({
            where: { id: server.id },
            data: {
              envEncrypted:
                server.envEncrypted ?? this.encryptMap(asStringMap(server.env)),
              headersEncrypted:
                server.headersEncrypted ??
                this.encryptMap(asStringMap(server.headers)),
              env: Prisma.DbNull,
              headers: Prisma.DbNull,
            },
          });
          migrated += 1;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Falha ao criptografar env/headers do servidor MCP ${server.id}: ${message}`,
          );
        }
      }
      if (migrated > 0) {
        this.logger.log(
          `env/headers criptografados em ${migrated} servidor(es) MCP gravados antes do ADR-007.`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Backfill de criptografia dos servidores MCP nao rodou: ${message}`,
      );
    }
  }

  /** Registro cru, com os segredos — nunca vai direto pra resposta HTTP. */
  private async getOwned(workspaceId: string, id: string) {
    const server = await this.prisma.mcpServer.findFirst({
      where: { id, workspaceId },
      include: { tools: true },
    });
    if (!server) {
      throw new NotFoundException('Servidor MCP nao encontrado.');
    }
    return server;
  }

  /**
   * O que sai da API. Os valores de env/headers ficam de fora (ADR-007: GET
   * devolve metadado, nunca segredo) e no lugar vao apenas os NOMES das
   * chaves configuradas — util pra UI mostrar o que esta setado e inofensivo
   * (o mesmo racional do `fieldsMeta` de Credential).
   *
   * Lista campo a campo de proposito, em vez de tirar os segredos de um
   * spread: assim uma coluna nova no model nasce fora da resposta ate alguem
   * decidir inclui-la, e nao vaza por esquecimento.
   */
  private toPublic(server: McpServerRow) {
    return {
      id: server.id,
      workspaceId: server.workspaceId,
      name: server.name,
      transport: server.transport,
      command: server.command,
      args: server.args,
      url: server.url,
      status: server.status,
      lastError: server.lastError,
      lastCheckedAt: server.lastCheckedAt,
      createdAt: server.createdAt,
      tools: server.tools,
      envKeys: this.secretKeys(server, 'env'),
      headerKeys: this.secretKeys(server, 'headers'),
    };
  }

  private secretKeys(server: McpSecretColumns, field: SecretField): string[] {
    try {
      return Object.keys(this.readSecretMap(server, field) ?? {});
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Listar nao pode quebrar por causa de um servidor com segredo
      // ilegivel: o erro real reaparece com contexto no `lastError` do
      // proximo connect/health-check, que e onde o usuario age.
      this.logger.warn(
        `Nao foi possivel ler as chaves de ${field}: ${message}`,
      );
      return [];
    }
  }

  /** `{}` nao e segredo: grava null em vez de um ciphertext de "{}". */
  private encryptMap(map: Record<string, string> | undefined): string | null {
    if (!map || Object.keys(map).length === 0) return null;
    return this.crypto.encrypt(JSON.stringify(map));
  }

  /**
   * Prefere sempre a coluna criptografada; so cai na coluna legada em claro
   * enquanto o backfill do boot nao passou naquela linha.
   */
  private readSecretMap(
    server: McpSecretColumns,
    field: SecretField,
  ): Record<string, string> | undefined {
    const encrypted =
      field === 'env' ? server.envEncrypted : server.headersEncrypted;
    if (encrypted) {
      try {
        return JSON.parse(this.crypto.decrypt(encrypted)) as Record<
          string,
          string
        >;
      } catch {
        // A causa quase sempre e SECRETS_ENCRYPTION_KEY trocada; o erro cru do
        // GCM ("Unsupported state or unable to authenticate data") nao diria
        // isso a ninguem, e ele acaba virando o lastError do servidor.
        throw new Error(
          `Nao foi possivel descriptografar ${field} deste servidor MCP — SECRETS_ENCRYPTION_KEY mudou?`,
        );
      }
    }
    const legacy = asStringMap(field === 'env' ? server.env : server.headers);
    return Object.keys(legacy).length > 0 ? legacy : undefined;
  }

  private async ensureConnected(id: string): Promise<McpClient> {
    const existing = this.clients.get(id);
    if (existing) return existing;
    await this.establishConnection(id);
    const client = this.clients.get(id);
    if (!client) {
      throw new BadRequestException(
        'Nao foi possivel conectar ao servidor MCP.',
      );
    }
    return client;
  }

  private buildConnectionConfig(
    server: McpSecretColumns & {
      transport: 'stdio' | 'sse' | 'http';
      command: string | null;
      args: Prisma.JsonValue | null;
      url: string | null;
    },
  ): McpConnectionConfig {
    return server.transport === 'stdio'
      ? {
          transport: 'stdio',
          command: server.command ?? '',
          args: (server.args as string[] | null) ?? [],
          env: this.readSecretMap(server, 'env'),
        }
      : {
          transport: server.transport,
          url: server.url ?? '',
          headers: this.readSecretMap(server, 'headers'),
        };
  }

  private async establishConnection(id: string): Promise<void> {
    const server = await this.prisma.mcpServer.findUniqueOrThrow({
      where: { id },
    });
    await this.closeClient(id);

    try {
      const config = this.buildConnectionConfig(server);
      const client = await connectMcpServer(config);
      this.clients.set(id, client);

      const tools = await listMcpTools(client);
      await this.prisma.$transaction([
        this.prisma.mcpTool.deleteMany({ where: { mcpServerId: id } }),
        this.prisma.mcpTool.createMany({
          data: tools.map((tool) => ({
            mcpServerId: id,
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema as Prisma.InputJsonValue,
          })),
        }),
      ]);

      await this.prisma.mcpServer.update({
        where: { id },
        data: {
          status: 'connected',
          lastError: null,
          lastCheckedAt: new Date(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Falha ao conectar MCP server ${id}: ${message}`);
      await this.prisma.mcpServer.update({
        where: { id },
        data: {
          status: 'error',
          lastError: message,
          lastCheckedAt: new Date(),
        },
      });
    }
  }

  private async closeClient(id: string): Promise<void> {
    const client = this.clients.get(id);
    if (!client) return;
    await client.close().catch(() => undefined);
    this.clients.delete(id);
  }

  async onModuleDestroy(): Promise<void> {
    for (const id of [...this.clients.keys()]) {
      await this.closeClient(id);
    }
  }
}
