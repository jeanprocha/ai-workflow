import { PrismaClient } from '@prisma/client';
import type { WorkflowGraph, WorkflowNode, WorkflowEdge } from '@workflow/shared';

const prisma = new PrismaClient();

function node(
  id: string,
  type: string,
  category: WorkflowNode['category'],
  label: string,
  x: number,
  y: number,
  config: Record<string, unknown>,
): WorkflowNode {
  return { id, type, category, label, position: { x, y }, config };
}

function edge(
  id: string,
  source: string,
  target: string,
  sourceHandle?: string,
): WorkflowEdge {
  return { id, source, target, sourceHandle };
}

function graph(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowGraph {
  return { nodes, edges, viewport: { x: 0, y: 0, zoom: 1 } };
}

interface TemplateSeed {
  name: string;
  description: string;
  category: string;
  graph: WorkflowGraph;
}

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const TEMPLATES: TemplateSeed[] = [
  {
    name: 'Suporte IA',
    description: 'Classifica, responde e escala tickets automaticamente.',
    category: 'Atendimento',
    graph: graph(
      [
        node('webhook', 'trigger.webhook', 'trigger', 'Webhook', 0, 0, {
          webhookId: '',
        }),
        node('classify', 'ai.classification', 'ai', 'Classificar ticket', 320, 0, {
          provider: 'anthropic',
          model: 'claude-haiku-4-5-20251001',
          credential: 'anthropic-default',
          categories: ['duvida', 'reclamacao', 'elogio'],
          text: '{{ $input.mensagem }}',
          temperature: 0,
          maxTokens: 200,
        }),
        node('if', 'logic.if', 'logic', 'E reclamacao?', 640, 0, {
          left: '{{ $input.category }}',
          operator: '==',
          right: 'reclamacao',
        }),
        node('agent', 'ai.agent', 'ai', 'Agente de suporte', 960, 0, {
          agentId: '',
          message: '{{ $node.webhook.mensagem }}',
        }),
        node('email', 'communication.email', 'communication', 'Enviar resposta', 1280, 0, {
          credential: '',
          to: '{{ $node.webhook.email }}',
          subject: 'Recebemos seu contato',
          body: '{{ $input }}',
        }),
      ],
      [
        edge('e1', 'webhook', 'classify'),
        edge('e2', 'classify', 'if'),
        edge('e3', 'if', 'agent', 'true'),
        edge('e4', 'agent', 'email'),
      ],
    ),
  },
  {
    name: 'Responder Email',
    description: 'Le, entende e responde emails recebidos.',
    category: 'Comunicacao',
    graph: graph(
      [
        node('webhook', 'trigger.webhook', 'trigger', 'Webhook', 0, 0, {
          webhookId: '',
        }),
        node('draft', 'ai.chat', 'ai', 'Redigir resposta', 320, 0, {
          provider: 'anthropic',
          model: 'claude-sonnet-5',
          credential: 'anthropic-default',
          systemPrompt: 'Voce escreve respostas de email educadas e diretas.',
          prompt: '{{ $input.mensagem }}',
          temperature: 0.5,
          maxTokens: 1024,
        }),
        node('email', 'communication.email', 'communication', 'Enviar resposta', 640, 0, {
          credential: '',
          to: '{{ $node.webhook.email }}',
          subject: 'Re: {{ $node.webhook.assunto }}',
          body: '{{ $input }}',
        }),
      ],
      [edge('e1', 'webhook', 'draft'), edge('e2', 'draft', 'email')],
    ),
  },
  {
    name: 'Extrair PDF',
    description: 'Extrai dados estruturados de documentos PDF.',
    category: 'Documentos',
    graph: graph(
      [
        node('trigger', 'trigger.manual', 'trigger', 'Manual', 0, 0, {}),
        node('pdf', 'file.pdf', 'file', 'Ler PDF', 320, 0, {
          url: '{{ $input.url }}',
        }),
        node('extract', 'ai.extraction', 'ai', 'Extrair dados', 640, 0, {
          provider: 'anthropic',
          model: 'claude-sonnet-5',
          credential: 'anthropic-default',
          text: '{{ $input.text }}',
          schema: {
            type: 'object',
            properties: {
              nome: { type: 'string' },
              valor_total: { type: 'number' },
              data: { type: 'string' },
            },
          },
          temperature: 0,
          maxTokens: 1024,
        }),
        node('log', 'logic.log', 'logic', 'Log resultado', 960, 0, {
          message: '{{ $input }}',
        }),
      ],
      [edge('e1', 'trigger', 'pdf'), edge('e2', 'pdf', 'extract'), edge('e3', 'extract', 'log')],
    ),
  },
  {
    name: 'Lead Qualification',
    description: 'Qualifica leads com base em regras e IA.',
    category: 'Vendas',
    graph: graph(
      [
        node('webhook', 'trigger.webhook', 'trigger', 'Webhook', 0, 0, {
          webhookId: '',
        }),
        node('classify', 'ai.classification', 'ai', 'Classificar lead', 320, 0, {
          provider: 'anthropic',
          model: 'claude-haiku-4-5-20251001',
          credential: 'anthropic-default',
          categories: ['quente', 'morno', 'frio'],
          text: '{{ $input.mensagem }}',
          temperature: 0,
          maxTokens: 200,
        }),
        node('if', 'logic.if', 'logic', 'E quente?', 640, 0, {
          left: '{{ $input.category }}',
          operator: '==',
          right: 'quente',
        }),
        node('slack', 'communication.slack', 'communication', 'Avisar vendas', 960, -80, {
          credential: '',
          message: 'Novo lead quente: {{ $node.webhook.nome }}',
        }),
        node('log', 'logic.log', 'logic', 'Log lead frio/morno', 960, 80, {
          message: 'Lead {{ $node.classify.category }}: {{ $node.webhook.nome }}',
        }),
      ],
      [
        edge('e1', 'webhook', 'classify'),
        edge('e2', 'classify', 'if'),
        edge('e3', 'if', 'slack', 'true'),
        edge('e4', 'if', 'log', 'false'),
      ],
    ),
  },
  {
    name: 'Resumo de reunioes',
    description: 'Resume transcricoes e envia para o time.',
    category: 'Produtividade',
    graph: graph(
      [
        node('trigger', 'trigger.manual', 'trigger', 'Manual', 0, 0, {}),
        node('summarize', 'ai.summarization', 'ai', 'Resumir transcricao', 320, 0, {
          provider: 'anthropic',
          model: 'claude-haiku-4-5-20251001',
          credential: 'anthropic-default',
          text: '{{ $input.transcricao }}',
          maxWords: 150,
          temperature: 0.3,
          maxTokens: 1024,
        }),
        node('email', 'communication.email', 'communication', 'Enviar resumo', 640, 0, {
          credential: '',
          to: '{{ $node.trigger.destinatarios }}',
          subject: 'Resumo da reuniao',
          body: '{{ $input }}',
        }),
      ],
      [edge('e1', 'trigger', 'summarize'), edge('e2', 'summarize', 'email')],
    ),
  },
  {
    name: 'Analise financeira',
    description: 'Analisa planilhas e gera relatorios com IA.',
    category: 'Financeiro',
    graph: graph(
      [
        node('trigger', 'trigger.manual', 'trigger', 'Manual', 0, 0, {}),
        node('csv', 'file.csv', 'file', 'Ler planilha', 320, 0, {
          source: 'url',
          url: '{{ $input.url }}',
          delimiter: ',',
        }),
        node('analyze', 'ai.chat', 'ai', 'Analisar dados', 640, 0, {
          provider: 'anthropic',
          model: 'claude-sonnet-5',
          credential: 'anthropic-default',
          systemPrompt: 'Voce e um analista financeiro. Seja direto e cite numeros.',
          prompt: 'Analise estes dados e aponte tendencias: {{ $input.rows }}',
          temperature: 0.2,
          maxTokens: 1500,
        }),
        node('email', 'communication.email', 'communication', 'Enviar relatorio', 960, 0, {
          credential: '',
          to: '{{ $node.trigger.destinatarios }}',
          subject: 'Relatorio financeiro',
          body: '{{ $input }}',
        }),
      ],
      [edge('e1', 'trigger', 'csv'), edge('e2', 'csv', 'analyze'), edge('e3', 'analyze', 'email')],
    ),
  },
  {
    name: 'OCR de documentos',
    description: 'Converte imagens e digitalizacoes em texto pesquisavel.',
    category: 'Documentos',
    graph: graph(
      [
        node('trigger', 'trigger.manual', 'trigger', 'Manual', 0, 0, {}),
        node('ocr', 'ai.ocr', 'ai', 'Extrair texto da imagem', 320, 0, {
          provider: 'anthropic',
          model: 'claude-sonnet-5',
          credential: 'anthropic-default',
          imageUrl: '{{ $input.imageUrl }}',
          temperature: 0,
          maxTokens: 2048,
        }),
        node('log', 'logic.log', 'logic', 'Log texto extraido', 640, 0, {
          message: '{{ $input }}',
        }),
      ],
      [edge('e1', 'trigger', 'ocr'), edge('e2', 'ocr', 'log')],
    ),
  },
];

async function main() {
  for (const template of TEMPLATES) {
    const id = slugify(template.name);
    await prisma.template.upsert({
      where: { id },
      create: {
        id,
        name: template.name,
        description: template.description,
        category: template.category,
        graph: template.graph as object,
      },
      update: {
        description: template.description,
        category: template.category,
        graph: template.graph as object,
      },
    });
  }
  console.log(`Seeded ${TEMPLATES.length} templates.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
