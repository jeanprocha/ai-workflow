import type { ToolDefinition } from '@workflow/ai';
import { Client } from 'pg';
import { evaluateMathExpression } from './calculator';
import type { CryptoService } from '../crypto/crypto.service';
import type { PrismaService } from '../prisma/prisma.service';

export interface AgentTool {
  definition: ToolDefinition;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

async function getCredentialValue(
  prisma: PrismaService,
  crypto: CryptoService,
  workspaceId: string,
  name: string,
): Promise<string> {
  const credential = await prisma.credential.findFirst({
    where: { workspaceId, name },
  });
  if (!credential) {
    throw new Error(`Credencial "${name}" nao encontrada neste workspace.`);
  }
  return crypto.decrypt(credential.encryptedData);
}

export function buildAgentTools(deps: {
  prisma: PrismaService;
  crypto: CryptoService;
  workspaceId: string;
  agentId?: string;
}): Record<string, AgentTool> {
  return {
    calculator: {
      definition: {
        name: 'calculator',
        description:
          'Avalia uma expressao aritmetica simples (+, -, *, /, parenteses).',
        parameters: {
          type: 'object',
          properties: {
            expressao: { type: 'string', description: 'Ex: (15 + 3) * 2' },
          },
          required: ['expressao'],
        },
      },
      execute: (args) =>
        Promise.resolve({
          result: evaluateMathExpression(asString(args.expressao)),
        }),
    },

    http: {
      definition: {
        name: 'http',
        description:
          'Faz uma requisicao HTTP (para consultar a internet ou uma API).',
        parameters: {
          type: 'object',
          properties: {
            method: {
              type: 'string',
              enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
            },
            url: { type: 'string' },
            body: { type: 'object' },
          },
          required: ['method', 'url'],
        },
      },
      execute: async (args) => {
        const method = asString(args.method, 'GET');
        const response = await fetch(asString(args.url), {
          method,
          headers: { 'Content-Type': 'application/json' },
          body:
            args.body && method !== 'GET'
              ? JSON.stringify(args.body)
              : undefined,
        });
        const contentType = response.headers.get('content-type') ?? '';
        const body: unknown = contentType.includes('application/json')
          ? await response.json().catch(() => null)
          : await response.text();
        return { status: response.status, body };
      },
    },

    sql: {
      definition: {
        name: 'sql',
        description:
          'Executa uma query SQL numa conexao Postgres do workspace.',
        parameters: {
          type: 'object',
          properties: {
            credential: {
              type: 'string',
              description: 'Nome da conexao (credential) do Postgres.',
            },
            query: { type: 'string' },
          },
          required: ['credential', 'query'],
        },
      },
      execute: async (args) => {
        const connectionString = await getCredentialValue(
          deps.prisma,
          deps.crypto,
          deps.workspaceId,
          asString(args.credential),
        );
        const client = new Client({ connectionString });
        await client.connect();
        try {
          const result = await client.query(asString(args.query));
          return { rows: result.rows, rowCount: result.rowCount };
        } finally {
          await client.end();
        }
      },
    },

    knowledge_base: {
      definition: {
        name: 'knowledge_base',
        description: 'Busca informacoes na base de conhecimento do workspace.',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      },
      execute: () =>
        Promise.resolve({
          result:
            'Knowledge Base ainda nao disponivel — chega na Fase 7 (RAG) do roadmap.',
        }),
    },

    memory_get: {
      definition: {
        name: 'memory_get',
        description:
          'Recupera um fato salvo anteriormente na memoria persistente deste agente, pela chave.',
        parameters: {
          type: 'object',
          properties: {
            chave: { type: 'string', description: 'Ex: preferencia_cliente' },
          },
          required: ['chave'],
        },
      },
      execute: async (args) => {
        if (!deps.agentId) {
          return {
            error: 'Memoria nao disponivel fora do contexto de um agente.',
          };
        }
        const memory = await deps.prisma.agentMemory.findUnique({
          where: {
            agentId_key: { agentId: deps.agentId, key: asString(args.chave) },
          },
        });
        return { valor: memory?.value ?? null };
      },
    },

    memory_set: {
      definition: {
        name: 'memory_set',
        description:
          'Salva ou atualiza um fato na memoria persistente deste agente, para lembrar em conversas futuras.',
        parameters: {
          type: 'object',
          properties: {
            chave: { type: 'string', description: 'Ex: preferencia_cliente' },
            valor: { type: 'string' },
          },
          required: ['chave', 'valor'],
        },
      },
      execute: async (args) => {
        if (!deps.agentId) {
          return {
            error: 'Memoria nao disponivel fora do contexto de um agente.',
          };
        }
        await deps.prisma.agentMemory.upsert({
          where: {
            agentId_key: { agentId: deps.agentId, key: asString(args.chave) },
          },
          create: {
            agentId: deps.agentId,
            key: asString(args.chave),
            value: asString(args.valor),
          },
          update: { value: asString(args.valor) },
        });
        return { salvo: true };
      },
    },
  };
}
