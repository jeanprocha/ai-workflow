import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type {
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
} from '@workflow/shared';
import { TemplatesService } from './templates.service';
import { CREDENTIAL_POLICY, RECORD_POLICY } from './template-sanitizer';

/**
 * @workflow/nodes/catalog resolve pro dist ESM puro do pacote
 * (packages/nodes/dist/catalog.js, "type": "module") e o jest do apps/api roda
 * ts-jest em CJS — sem esse mock, importar TemplatesService (-> workflows.service
 * -> graph.schema) quebra o spec inteiro. graph.schema so usa getCatalogEntry
 * pra checar se node.type existe, entao um stub com os types dos fixtures
 * basta e o spec deixa de depender do build de packages/nodes.
 */
const KNOWN_TYPES = [
  'trigger.manual',
  'trigger.webhook',
  'trigger.chat',
  'chat.reply',
  'logic.log',
  'ai.chat',
  'ai.agent',
  'api.httpRequest',
  'api.graphql',
  'knowledge.search',
  'mcp.tool',
  'database.postgres',
];
jest.mock('@workflow/nodes/catalog', () => ({
  getCatalogEntry: (type: string) =>
    KNOWN_TYPES.includes(type) ? { type } : undefined,
}));
// @workflow/shared tambem resolve pro dist ESM (packages/shared/dist,
// "type": "module") — graph.schema.ts importa ERROR_HANDLE em runtime (H2-05)
// pra validar edge de erro orfa, o suficiente pra quebrar o spec sem o mock.
jest.mock('@workflow/shared', () => ({ ERROR_HANDLE: 'error' }));

function node(
  id: string,
  type: string,
  config: Record<string, unknown> = {},
): WorkflowNode {
  return {
    id,
    type,
    category: type.startsWith('trigger.') ? 'trigger' : 'logic',
    label: id,
    position: { x: 0, y: 0 },
    config,
  };
}

function edge(source: string, target: string): WorkflowEdge {
  return { id: `${source}->${target}`, source, target };
}

function graph(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[] = [],
): WorkflowGraph {
  return { nodes, edges, viewport: { x: 0, y: 0, zoom: 1 } };
}

function buildService(templateGraph: unknown) {
  const tx = {
    workflow: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'wf-1',
        ...data,
      })),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'wf-1',
        ...data,
      })),
    },
    workflowVersion: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'ver-1',
        ...data,
      })),
    },
  };
  const prisma = {
    template: {
      findFirst: jest.fn().mockResolvedValue(
        templateGraph === null
          ? null
          : {
              id: 'tpl-1',
              name: 'Template X',
              description: 'Descricao X',
              graph: templateGraph,
            },
      ),
      findMany: jest.fn().mockResolvedValue([]),
    },
    // use() usa a forma CALLBACK do $transaction (nao a forma array que
    // engine.service.spec.ts mocka) — o mock so roda o callback com o
    // proprio objeto de tx, sem transacao real.
    $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const service = new TemplatesService(prisma as never);
  return { service, prisma, tx };
}

describe('TemplatesService.use', () => {
  it('template inexistente: lanca NotFoundException e nao abre transacao', async () => {
    const { service, prisma } = buildService(null);

    await expect(service.use('ws-1', 'user-1', 'tpl-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('grafo invalido (node.type fora do catalogo): lanca BadRequestException e nao cria nada', async () => {
    const invalidGraph = graph([node('n1', 'tipo.inexistente')]);
    const { service, prisma } = buildService(invalidGraph);

    await expect(service.use('ws-1', 'user-1', 'tpl-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('template com trigger.chat: gera chatToken/inboxToken e grava nas colunas e no grafo salvo', async () => {
    const chatGraph = graph(
      [node('n1', 'trigger.chat'), node('n2', 'chat.reply')],
      [edge('n1', 'n2')],
    );
    const { service, tx } = buildService(chatGraph);

    await service.use('ws-1', 'user-1', 'tpl-1');

    const createData = tx.workflow.create.mock.calls[0][0].data;
    expect(createData.chatToken).toEqual(expect.any(String));
    expect(createData.inboxToken).toEqual(expect.any(String));

    const versionData = tx.workflowVersion.create.mock.calls[0][0].data as {
      graph: WorkflowGraph;
    };
    const chatNode = versionData.graph.nodes.find((n) => n.id === 'n1');
    expect(chatNode?.config.chatToken).toBe(createData.chatToken);
    expect(chatNode?.config.inboxToken).toBe(createData.inboxToken);
  });

  it('tokens herdados de um fluxo de origem sao substituidos (evita colisao de @unique na 2a instanciacao)', async () => {
    const inheritedGraph = graph([
      node('n1', 'trigger.chat', {
        chatToken: 'herdado-chat',
        inboxToken: 'herdado-inbox',
      }),
    ]);
    const { service, tx } = buildService(inheritedGraph);

    await service.use('ws-1', 'user-1', 'tpl-1');

    const createData = tx.workflow.create.mock.calls[0][0].data;
    expect(createData.chatToken).not.toBe('herdado-chat');
    expect(createData.inboxToken).not.toBe('herdado-inbox');
  });

  it('duas instanciacoes do mesmo template geram tokens diferentes', async () => {
    const chatGraph = graph([node('n1', 'trigger.chat')]);
    const { service, tx } = buildService(chatGraph);

    await service.use('ws-1', 'user-1', 'tpl-1');
    await service.use('ws-1', 'user-2', 'tpl-1');

    const [firstCall, secondCall] = tx.workflow.create.mock.calls;
    const firstData = firstCall[0].data;
    const secondData = secondCall[0].data;
    expect(firstData.chatToken).not.toBe(secondData.chatToken);
  });

  it('template no formato dos seeds (so trigger.webhook, webhookId vazio): gera webhookId e nao mexe em tokens de chat', async () => {
    const webhookGraph = graph([
      node('n1', 'trigger.webhook', { webhookId: '' }),
    ]);
    const { service, tx } = buildService(webhookGraph);

    await service.use('ws-1', 'user-1', 'tpl-1');

    const createData = tx.workflow.create.mock.calls[0][0].data;
    expect(createData.webhookId).toEqual(expect.any(String));
    expect(createData.webhookId).not.toBe('');
    expect(createData.chatToken).toBeUndefined();
    expect(createData.inboxToken).toBeUndefined();
  });

  it('escopo: busca com OR (global OU do workspace), nunca so pelo id', async () => {
    const { service, prisma } = buildService(
      graph([node('n1', 'trigger.manual')]),
    );

    await service.use('ws-1', 'user-1', 'tpl-1');

    expect(prisma.template.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'tpl-1',
        OR: [{ workspaceId: null }, { workspaceId: 'ws-1' }],
      },
    });
  });

  it('template fora do escopo (de outro workspace): NotFoundException, sem abrir transacao', async () => {
    const { service, prisma } = buildService(null);

    await expect(service.use('ws-1', 'user-1', 'tpl-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('TemplatesService.list', () => {
  it('lista globais (workspace_id null) + os do workspace atual, ordenado por createdAt asc', async () => {
    const { service, prisma } = buildService(null);

    await service.list('ws-1');

    expect(prisma.template.findMany).toHaveBeenCalledWith({
      where: { OR: [{ workspaceId: null }, { workspaceId: 'ws-1' }] },
      orderBy: { createdAt: 'asc' },
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// create/update/remove — usa um fake in-memory de Prisma (matcher estrutural
// de `where`) em vez de mocks fixos por chamada: os tres metodos consultam
// `template.findFirst` com shapes de `where` DIFERENTES (conflito de nome,
// ownership, clash de rename) e um fake de verdade e mais robusto que
// encadear mockResolvedValueOnce por ordem de chamada.
// ─────────────────────────────────────────────────────────────────────────

function matchesWhere(
  row: Record<string, unknown>,
  where: Record<string, unknown>,
): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'NOT') {
      const notClause = value as Record<string, unknown>;
      return !Object.entries(notClause).every(([k, v]) => row[k] === v);
    }
    return row[key] === value;
  });
}

function buildCrudService(seed: {
  templates?: Array<Record<string, unknown>>;
  workflows?: Array<{
    id: string;
    workspaceId: string;
    currentVersion: { graph: unknown } | null;
  }>;
  versions?: Array<{ id: string; workflowId: string; graph: unknown }>;
}) {
  const templates = [...(seed.templates ?? [])];
  const workflows = seed.workflows ?? [];
  const versions = seed.versions ?? [];

  const prisma = {
    template: {
      findFirst: jest.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          templates.find((t) => matchesWhere(t, where)) ?? null,
      ),
      findMany: jest.fn(async () => templates),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const created = {
          id: `tpl-${templates.length + 1}`,
          createdAt: new Date(),
          ...data,
        };
        templates.push(created);
        return created;
      }),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const template = templates.find((t) => t.id === where.id);
          Object.assign(template as object, data);
          return template;
        },
      ),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        const index = templates.findIndex((t) => t.id === where.id);
        templates.splice(index, 1);
      }),
    },
    workflow: {
      findFirst: jest.fn(
        async ({ where }: { where: { id: string; workspaceId: string } }) =>
          workflows.find(
            (w) => w.id === where.id && w.workspaceId === where.workspaceId,
          ) ?? null,
      ),
    },
    workflowVersion: {
      findFirst: jest.fn(
        async ({ where }: { where: { id: string; workflowId: string } }) =>
          versions.find(
            (v) => v.id === where.id && v.workflowId === where.workflowId,
          ) ?? null,
      ),
    },
  };

  const service = new TemplatesService(prisma as never);
  return { service, prisma, templates };
}

/** api.httpRequest com credential/headers/query/signature/webhookId — cobre a sanitizacao inteira num node so. */
function httpNode(): WorkflowNode {
  return node('http', 'api.httpRequest', {
    credential: 'minha-conn',
    url: 'https://erp.example/webhook?token=embutido',
    headers: { Authorization: 'Bearer x', 'X-Trace': '1' },
    query: { api_key: 's', foo: 'bar' },
    signature: { header: 'X-Sig', secret: 'shh', enabled: true },
    webhookId: 'wh-1',
  });
}

describe('TemplatesService.create', () => {
  it('sanitiza credential/ids/headers/query/signature/tokens e valida o resultado', async () => {
    const fixtureGraph = graph([
      httpNode(),
      node('agent', 'ai.agent', { agentId: 'ag-1', credential: 'c' }),
      node('kb', 'knowledge.search', {
        knowledgeBaseId: 'kb-1',
        query: 'texto de busca',
      }),
      node('mcp', 'mcp.tool', { mcpServerId: 'mcp-1', toolName: 'x' }),
    ]);
    const { service, prisma, templates } = buildCrudService({
      workflows: [
        {
          id: 'wf-1',
          workspaceId: 'ws-1',
          currentVersion: { graph: fixtureGraph },
        },
      ],
    });

    await service.create('ws-1', {
      name: 'Meu Template',
      category: 'Vendas',
      workflowId: 'wf-1',
    });

    expect(prisma.template.create).toHaveBeenCalledTimes(1);
    const saved = templates[0].graph as WorkflowGraph;

    const http = saved.nodes.find((n) => n.id === 'http')!;
    expect(http.config.credential).toBe(
      CREDENTIAL_POLICY === 'keep' ? 'minha-conn' : '',
    );
    expect(http.config.url).toBe('https://erp.example/webhook?token=embutido'); // limitacao documentada: url nao e tocada
    expect(http.config.webhookId).toBeUndefined(); // removido, nao vazio
    const headers = http.config.headers as Record<string, string>;
    // Authorization casa a regex de sensivel em QUALQUER politica — zerado
    // tanto em 'sensitive-keys' quanto em 'all'.
    expect(headers.Authorization).toBe('');
    expect(headers['X-Trace']).toBe(
      RECORD_POLICY === 'sensitive-keys' ? '1' : '',
    );
    const query = http.config.query as Record<string, string>;
    expect(query.api_key).toBe('');
    expect(query.foo).toBe(RECORD_POLICY === 'sensitive-keys' ? 'bar' : '');
    const signature = http.config.signature as Record<string, unknown>;
    expect(signature.secret).toBe('');
    expect(signature.header).toBe('X-Sig');
    expect(signature.enabled).toBe(true);

    const agent = saved.nodes.find((n) => n.id === 'agent')!;
    expect(agent.config.agentId).toBe('');
    expect(agent.config.credential).toBe(
      CREDENTIAL_POLICY === 'keep' ? 'c' : '',
    );

    const kb = saved.nodes.find((n) => n.id === 'kb')!;
    expect(kb.config.knowledgeBaseId).toBe('');
    // guard de tipo: `query` aqui e STRING de busca, nao record — nao pode ser tocado.
    expect(kb.config.query).toBe('texto de busca');

    const mcp = saved.nodes.find((n) => n.id === 'mcp')!;
    expect(mcp.config.mcpServerId).toBe('');
  });

  it('nome duplicado no workspace: ConflictException, nada criado', async () => {
    const { service, prisma } = buildCrudService({
      templates: [{ id: 'tpl-1', workspaceId: 'ws-1', name: 'Ja Existe' }],
    });

    await expect(
      service.create('ws-1', {
        name: 'Ja Existe',
        category: 'Vendas',
        workflowId: 'wf-1',
      }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.template.create).not.toHaveBeenCalled();
  });

  it('fluxo de outro workspace (ou inexistente): NotFoundException', async () => {
    const { service } = buildCrudService({
      workflows: [
        {
          id: 'wf-1',
          workspaceId: 'ws-2',
          currentVersion: { graph: graph([]) },
        },
      ],
    });

    await expect(
      service.create('ws-1', {
        name: 'X',
        category: 'Vendas',
        workflowId: 'wf-1',
      }),
    ).rejects.toThrow('Fluxo nao encontrado.');
  });

  it('fluxo sem versao salva: BadRequestException', async () => {
    const { service } = buildCrudService({
      workflows: [{ id: 'wf-1', workspaceId: 'ws-1', currentVersion: null }],
    });

    await expect(
      service.create('ws-1', {
        name: 'X',
        category: 'Vendas',
        workflowId: 'wf-1',
      }),
    ).rejects.toThrow('Este fluxo ainda nao tem uma versao salva.');
  });

  it('versionId que nao pertence ao fluxo: NotFoundException "Versao nao encontrada."', async () => {
    const { service } = buildCrudService({
      workflows: [
        {
          id: 'wf-1',
          workspaceId: 'ws-1',
          currentVersion: { graph: graph([]) },
        },
      ],
      versions: [],
    });

    await expect(
      service.create('ws-1', {
        name: 'X',
        category: 'Vendas',
        workflowId: 'wf-1',
        versionId: 'ver-de-outro-fluxo',
      }),
    ).rejects.toThrow('Versao nao encontrada.');
  });

  it('grafo com node.type fora do catalogo pos-sanitizacao: BadRequestException', async () => {
    const { service, prisma } = buildCrudService({
      workflows: [
        {
          id: 'wf-1',
          workspaceId: 'ws-1',
          currentVersion: { graph: graph([node('n1', 'tipo.inexistente')]) },
        },
      ],
    });

    await expect(
      service.create('ws-1', {
        name: 'X',
        category: 'Vendas',
        workflowId: 'wf-1',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.template.create).not.toHaveBeenCalled();
  });
});

describe('TemplatesService.update', () => {
  it('template global (workspace_id null): NotFoundException, nao atualiza', async () => {
    const { service, prisma } = buildCrudService({
      templates: [{ id: 'tpl-1', workspaceId: null, name: 'Seed' }],
    });

    await expect(
      service.update('ws-1', 'tpl-1', { category: 'Nova' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.template.update).not.toHaveBeenCalled();
  });

  it('template de outro workspace: NotFoundException, nao atualiza', async () => {
    const { service, prisma } = buildCrudService({
      templates: [{ id: 'tpl-1', workspaceId: 'ws-2', name: 'De Outro' }],
    });

    await expect(
      service.update('ws-1', 'tpl-1', { category: 'Nova' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.template.update).not.toHaveBeenCalled();
  });

  it('rename para nome ja usado no workspace: ConflictException', async () => {
    const { service, prisma } = buildCrudService({
      templates: [
        { id: 'tpl-1', workspaceId: 'ws-1', name: 'Meu Template' },
        { id: 'tpl-2', workspaceId: 'ws-1', name: 'Nome Ocupado' },
      ],
    });

    await expect(
      service.update('ws-1', 'tpl-1', { name: 'Nome Ocupado' }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.template.update).not.toHaveBeenCalled();
  });

  it('PATCH parcial: so o campo enviado entra no data', async () => {
    const { service, prisma } = buildCrudService({
      templates: [{ id: 'tpl-1', workspaceId: 'ws-1', name: 'Meu Template' }],
    });

    await service.update('ws-1', 'tpl-1', { category: 'Financeiro' });

    expect(prisma.template.update).toHaveBeenCalledWith({
      where: { id: 'tpl-1' },
      data: { category: 'Financeiro' },
    });
  });
});

describe('TemplatesService.remove', () => {
  it('template global ou de outro workspace: NotFoundException, nao deleta', async () => {
    const { service, prisma } = buildCrudService({
      templates: [{ id: 'tpl-1', workspaceId: null, name: 'Seed' }],
    });

    await expect(service.remove('ws-1', 'tpl-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.template.delete).not.toHaveBeenCalled();
  });

  it('remove o proprio template do workspace', async () => {
    const { service, prisma, templates } = buildCrudService({
      templates: [{ id: 'tpl-1', workspaceId: 'ws-1', name: 'Meu Template' }],
    });

    await service.remove('ws-1', 'tpl-1');

    expect(prisma.template.delete).toHaveBeenCalledWith({
      where: { id: 'tpl-1' },
    });
    expect(templates).toHaveLength(0);
  });
});
