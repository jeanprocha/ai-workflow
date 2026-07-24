import { Injectable, NotFoundException } from '@nestjs/common';
import { getProvider, type ChatMessage } from '@workflow/ai';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { McpService } from '../mcp/mcp.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { buildAgentTools, type AgentTool } from './tools';

/** Prefixo usado em agent.tools para referenciar uma tool MCP: "mcp:<serverId>:<toolName>". */
const MCP_TOOL_PREFIX = 'mcp:';

const MAX_TOOL_ITERATIONS = 5;

export interface AgentChatResult {
  content: string;
  tokensTotal: number;
  costUsd: number;
  toolCallsUsed: string[];
}

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly knowledge: KnowledgeService,
    private readonly mcp: McpService,
  ) {}

  list(workspaceId: string) {
    return this.prisma.agent.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(workspaceId: string, id: string) {
    const agent = await this.prisma.agent.findFirst({
      where: { id, workspaceId },
    });
    if (!agent) {
      throw new NotFoundException('Agente nao encontrado.');
    }
    return agent;
  }

  create(workspaceId: string, dto: CreateAgentDto) {
    return this.prisma.agent.create({
      data: {
        workspaceId,
        name: dto.name,
        description: dto.description,
        systemPrompt: dto.systemPrompt,
        provider: dto.provider ?? 'anthropic',
        model: dto.model,
        credential: dto.credential ?? '',
        temperature: dto.temperature ?? 0.7,
        tools: dto.tools ?? [],
        knowledgeBaseId: dto.knowledgeBaseId,
      },
    });
  }

  async update(workspaceId: string, id: string, dto: UpdateAgentDto) {
    await this.findOne(workspaceId, id);
    return this.prisma.agent.update({
      where: { id },
      data: {
        ...dto,
        tools: dto.tools ? (dto.tools as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  async remove(workspaceId: string, id: string) {
    await this.findOne(workspaceId, id);
    await this.prisma.agent.delete({ where: { id } });
  }

  async chat(
    workspaceId: string,
    agentId: string,
    message: string,
    history: ChatMessage[] = [],
  ): Promise<AgentChatResult> {
    const agent = await this.findOne(workspaceId, agentId);
    const provider = getProvider(agent.provider);
    const apiKey =
      agent.provider === 'ollama'
        ? ''
        : await this.getCredential(workspaceId, agent.credential);

    const enabledToolNames = (agent.tools as string[]) ?? [];
    const nativeToolNames = enabledToolNames.filter(
      (name) => !name.startsWith(MCP_TOOL_PREFIX),
    );
    const mcpRefs = enabledToolNames.filter((name) =>
      name.startsWith(MCP_TOOL_PREFIX),
    );

    const nativeToolset = buildAgentTools({
      prisma: this.prisma,
      crypto: this.crypto,
      workspaceId,
      agentId: agent.id,
      knowledge: this.knowledge,
      knowledgeBaseId: agent.knowledgeBaseId,
    });
    const nativeTools = nativeToolNames
      .map((name) => nativeToolset[name])
      .filter((tool): tool is AgentTool => !!tool);
    const mcpTools = await this.buildMcpTools(workspaceId, mcpRefs);

    const tools = [...nativeTools, ...mcpTools];
    const toolsByName = new Map(
      tools.map((tool) => [tool.definition.name, tool]),
    );

    const messages: ChatMessage[] = [
      { role: 'system', content: agent.systemPrompt },
      ...history,
      { role: 'user', content: message },
    ];

    let tokensTotal = 0;
    let costUsd = 0;
    const toolCallsUsed: string[] = [];

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const result = await provider.chat({
        apiKey,
        model: agent.model,
        messages,
        temperature: agent.temperature,
        tools: tools.map((tool) => tool.definition),
      });

      tokensTotal += result.usage.inputTokens + result.usage.outputTokens;
      costUsd += result.costUsd;

      if (result.toolCalls.length === 0) {
        return { content: result.content, tokensTotal, costUsd, toolCallsUsed };
      }

      messages.push({
        role: 'assistant',
        content: result.content,
        toolCalls: result.toolCalls,
      });

      for (const call of result.toolCalls) {
        const tool = toolsByName.get(call.name);
        toolCallsUsed.push(call.name);
        const output = tool
          ? await tool.execute(call.arguments).catch((error: unknown) => ({
              error: error instanceof Error ? error.message : String(error),
            }))
          : {
              error: `Tool "${call.name}" nao esta habilitada para este agente.`,
            };

        messages.push({
          role: 'tool',
          content: JSON.stringify(output),
          toolCallId: call.id,
        });
      }
    }

    return {
      content:
        'O agente atingiu o limite de chamadas de ferramentas sem concluir.',
      tokensTotal,
      costUsd,
      toolCallsUsed,
    };
  }

  /** Remove chaves meta ($schema, $id) que os providers de IA nao esperam no schema da tool. */
  private sanitizeMcpInputSchema(
    schema: Record<string, unknown>,
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(schema).filter(
        ([key]) => key !== '$schema' && key !== '$id',
      ),
    );
  }

  /** Converte refs "mcp:<serverId>:<toolName>" habilitadas no agente em AgentTool executaveis. */
  private async buildMcpTools(
    workspaceId: string,
    refs: string[],
  ): Promise<AgentTool[]> {
    const tools: AgentTool[] = [];

    for (const ref of refs) {
      const [, serverId, toolName] = ref.split(':');
      if (!serverId || !toolName) continue;

      const server = await this.prisma.mcpServer.findFirst({
        where: { id: serverId, workspaceId },
        include: { tools: true },
      });
      const toolMeta = server?.tools.find((tool) => tool.name === toolName);
      if (!server || !toolMeta) continue;

      tools.push({
        definition: {
          name: toolMeta.name,
          description:
            toolMeta.description ??
            `Tool MCP "${toolMeta.name}" do servidor "${server.name}".`,
          parameters: this.sanitizeMcpInputSchema(
            toolMeta.inputSchema as Record<string, unknown>,
          ),
        },
        execute: async (args) => {
          const result = await this.mcp.callTool(
            workspaceId,
            serverId,
            toolName,
            args,
          );
          return result;
        },
      });
    }

    return tools;
  }

  private async getCredential(
    workspaceId: string,
    name: string,
  ): Promise<string> {
    const credential = await this.prisma.credential.findFirst({
      where: { workspaceId, name },
    });
    if (!credential) {
      throw new NotFoundException(
        `Credencial "${name}" nao encontrada neste workspace.`,
      );
    }
    return this.crypto.decrypt(credential.encryptedData);
  }
}
