import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from '@workflow/shared';

/**
 * @workflow/nodes/catalog e @workflow/shared resolvem pro dist ESM puro dos
 * pacotes ("type": "module"), incompativel com o ts-jest do api em CJS —
 * mesma familia de mock de templates.service.spec.ts/engine.service.spec.ts.
 */
const KNOWN_TYPES = [
  'trigger.manual',
  'trigger.chat',
  'logic.log',
  'logic.merge',
  'logic.if',
  'approval.human',
];
jest.mock('@workflow/nodes/catalog', () => ({
  getCatalogEntry: (type: string) =>
    KNOWN_TYPES.includes(type) ? { type } : undefined,
}));
jest.mock('@workflow/shared', () => ({
  ERROR_HANDLE: 'error',
  APPROVAL_NODE_TYPE: 'approval.human',
}));

import { workflowGraphSchema } from './graph.schema';

function node(id: string, type: string, overrides: Partial<WorkflowNode> = {}): WorkflowNode {
  return {
    id,
    type,
    category: 'logic',
    label: id,
    position: { x: 0, y: 0 },
    config: {},
    ...overrides,
  };
}

function edge(source: string, target: string, sourceHandle?: string): WorkflowEdge {
  return {
    id: `${source}->${target}${sourceHandle ? `:${sourceHandle}` : ''}`,
    source,
    target,
    sourceHandle,
  };
}

function graph(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowGraph {
  return { nodes, edges, viewport: { x: 0, y: 0, zoom: 1 } };
}

describe('workflowGraphSchema (H2-05: edge de erro orfa)', () => {
  it('rejeita edge sourceHandle:"error" cujo node de origem nao tem onError:"branch"', () => {
    const result = workflowGraphSchema.safeParse(
      graph(
        [node('A', 'logic.log'), node('B', 'logic.log')],
        [edge('A', 'B', 'error')],
      ),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['edges', 0, 'sourceHandle']);
      expect(result.error.issues[0]?.message).toContain('Caminho de erro');
    }
  });

  it('aceita edge sourceHandle:"error" quando o node de origem tem onError:"branch"', () => {
    const result = workflowGraphSchema.safeParse(
      graph(
        [node('A', 'logic.log', { onError: 'branch' }), node('B', 'logic.log')],
        [edge('A', 'B', 'error')],
      ),
    );

    expect(result.success).toBe(true);
  });

  it('aceita onError:"continue" sem nenhuma edge de erro', () => {
    const result = workflowGraphSchema.safeParse(
      graph(
        [node('A', 'logic.log', { onError: 'continue' }), node('B', 'logic.log')],
        [edge('A', 'B')],
      ),
    );

    expect(result.success).toBe(true);
  });

  it('rejeita edge sourceHandle:"error" num node com onError:"continue" (continue nao usa edge dedicada)', () => {
    const result = workflowGraphSchema.safeParse(
      graph(
        [node('A', 'logic.log', { onError: 'continue' }), node('B', 'logic.log')],
        [edge('A', 'B', 'error')],
      ),
    );

    expect(result.success).toBe(false);
  });

  it('H2-06: rejeita approval.human combinado com trigger.chat no mesmo grafo', () => {
    const result = workflowGraphSchema.safeParse(
      graph(
        [
          node('T', 'trigger.chat', { category: 'trigger' }),
          node('A', 'approval.human'),
        ],
        [edge('T', 'A')],
      ),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['nodes', 1, 'type']);
      expect(result.error.issues[0]?.message).toContain('Chat');
    }
  });

  it('H2-06: aceita approval.human num grafo sem trigger.chat', () => {
    const result = workflowGraphSchema.safeParse(
      graph(
        [
          node('T', 'trigger.manual', { category: 'trigger' }),
          node('A', 'approval.human'),
        ],
        [edge('T', 'A')],
      ),
    );

    expect(result.success).toBe(true);
  });

  it('regressao: continua rejeitando tipo de node desconhecido e edge com id inexistente', () => {
    const result = workflowGraphSchema.safeParse(
      graph([node('A', 'tipo.inventado')], [edge('A', 'nao-existe')]),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toEqual(
        expect.arrayContaining(['nodes.0.type', 'edges.0.target']),
      );
    }
  });
});
