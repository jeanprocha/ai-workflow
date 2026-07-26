import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  callMcpTool,
  connectMcpServer,
  listMcpTools,
  type McpConnectionConfig,
} from '@workflow/ai';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectMcpServerDto } from './dto/connect-mcp-server.dto';

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : (value as Prisma.InputJsonValue);
}

/** Evita importar o tipo Client direto do SDK — dual package hazard (ESM/CJS geram tipos nominais distintos). */
type McpClient = Awaited<ReturnType<typeof connectMcpServer>>;

@Injectable()
export class McpService implements OnModuleDestroy {
  private readonly logger = new Logger(McpService.name);
  /** Conexoes vivas no processo (ADR-005: worker single-process, ver Fase 6). */
  private readonly clients = new Map<string, McpClient>();

  constructor(private readonly prisma: PrismaService) {}

  list(workspaceId: string) {
    return this.prisma.mcpServer.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: { tools: true },
    });
  }

  async findOne(workspaceId: string, id: string) {
    const server = await this.prisma.mcpServer.findFirst({
      where: { id, workspaceId },
      include: { tools: true },
    });
    if (!server) {
      throw new NotFoundException('Servidor MCP nao encontrado.');
    }
    return server;
  }

  async connect(workspaceId: string, dto: ConnectMcpServerDto) {
    const server = await this.prisma.mcpServer.create({
      data: {
        workspaceId,
        name: dto.name,
        transport: dto.transport,
        command: dto.command,
        args: toJson(dto.args),
        env: toJson(dto.env),
        url: dto.url,
        headers: toJson(dto.headers),
        status: 'connecting',
      },
    });

    await this.establishConnection(server.id);
    return this.findOne(workspaceId, server.id);
  }

  async reconnect(workspaceId: string, id: string) {
    await this.findOne(workspaceId, id);
    await this.establishConnection(id);
    return this.findOne(workspaceId, id);
  }

  async disconnect(workspaceId: string, id: string) {
    await this.findOne(workspaceId, id);
    await this.closeClient(id);
    await this.prisma.mcpServer.update({
      where: { id },
      data: { status: 'disconnected' },
    });
  }

  async remove(workspaceId: string, id: string) {
    await this.findOne(workspaceId, id);
    await this.closeClient(id);
    await this.prisma.mcpServer.delete({ where: { id } });
  }

  async callTool(
    workspaceId: string,
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ) {
    await this.findOne(workspaceId, serverId);
    // Conectividade primeiro: um servidor nunca conectado tem `tools: []`
    // persistido, entao checar o nome da tool ANTES disso faria qualquer
    // chamada nele devolver "tool nao encontrada" — mensagem enganosa que
    // esconde o problema real (servidor inalcancavel). ensureConnected lanca
    // 400 nesse caso.
    const client = await this.ensureConnected(serverId);
    // Re-busca depois de conectar: se a conexao era lazy (server estava
    // disconnected), establishConnection acabou de atualizar as tools
    // persistidas — o `findOne` de cima poderia estar desatualizado.
    const server = await this.findOne(workspaceId, serverId);
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

  private buildConnectionConfig(server: {
    transport: 'stdio' | 'sse' | 'http';
    command: string | null;
    args: unknown;
    env: unknown;
    url: string | null;
    headers: unknown;
  }): McpConnectionConfig {
    return server.transport === 'stdio'
      ? {
          transport: 'stdio',
          command: server.command ?? '',
          args: (server.args as string[] | null) ?? [],
          env: (server.env as Record<string, string> | null) ?? undefined,
        }
      : {
          transport: server.transport,
          url: server.url ?? '',
          headers:
            (server.headers as Record<string, string> | null) ?? undefined,
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
