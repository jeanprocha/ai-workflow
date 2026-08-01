import { z } from 'zod';
import {
  APPROVAL_NODE_TYPE,
  ERROR_HANDLE,
  type WorkflowGraph,
} from '@workflow/shared';
import { getCatalogEntry } from '@workflow/nodes/catalog';

const nodeCategorySchema = z.enum([
  'trigger',
  'logic',
  'database',
  'api',
  'file',
  'ai',
  'communication',
]);

const nodeRetryPolicySchema = z.object({
  attempts: z.number().int().min(1).max(10),
  backoffMs: z.number().int().min(0),
});

const workflowNodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  category: nodeCategorySchema,
  label: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  config: z.record(z.string(), z.unknown()),
  retry: nodeRetryPolicySchema.optional(),
  onError: z.enum(['fail', 'branch', 'continue']).optional(),
});

const workflowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  sourceHandle: z.string().optional(),
  target: z.string(),
  targetHandle: z.string().optional(),
});

/** Exportado sem o superRefine — usado para gerar o JSON Schema do Autocomplete (Fase 11). */
export const workflowGraphShape = z.object({
  nodes: z.array(workflowNodeSchema),
  edges: z.array(workflowEdgeSchema),
  viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number() }),
}) satisfies z.ZodType<WorkflowGraph>;

/**
 * Validacao cruzada (Fase 11): alem da forma, garante que node.type existe no
 * catalogo e que toda edge referencia ids de node existentes no proprio grafo.
 * Sem isso, um grafo gerado por IA (Autocomplete) com um type inventado ou uma
 * edge solta passaria pelo schema estrutural e so quebraria em runtime, na
 * execucao — pior lugar possivel para descobrir o problema.
 */
export const workflowGraphSchema = workflowGraphShape.superRefine(
  (graph, ctx) => {
    const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));

    graph.nodes.forEach((node, index) => {
      if (!getCatalogEntry(node.type)) {
        ctx.addIssue({
          code: 'custom',
          message: `Tipo de node desconhecido: "${node.type}".`,
          path: ['nodes', index, 'type'],
        });
      }
    });

    // H2-06: aprovacao humana bloqueada em fluxos disparados por Chat (v1) —
    // conversation.state so e persistido no bloco terminal de engine.run()
    // (ver comentario la), e uma 2a mensagem do visitante durante a pausa
    // causaria lost update silencioso no $vars da conversa. Mesmo precedente
    // do refine de ERROR_HANDLE acima: regra cross-cutting que nao cabe no
    // configSchema de um node isolado.
    const hasChatTrigger = graph.nodes.some(
      (node) => node.type === 'trigger.chat',
    );
    if (hasChatTrigger) {
      graph.nodes.forEach((node, index) => {
        if (node.type === APPROVAL_NODE_TYPE) {
          ctx.addIssue({
            code: 'custom',
            message:
              'Aprovacao humana nao e suportada em fluxos disparados por Chat (v1).',
            path: ['nodes', index, 'type'],
          });
        }
      });
    }

    graph.edges.forEach((edge, index) => {
      if (!nodesById.has(edge.source)) {
        ctx.addIssue({
          code: 'custom',
          message: `Edge referencia um node de origem inexistente: "${edge.source}".`,
          path: ['edges', index, 'source'],
        });
      }
      if (!nodesById.has(edge.target)) {
        ctx.addIssue({
          code: 'custom',
          message: `Edge referencia um node de destino inexistente: "${edge.target}".`,
          path: ['edges', index, 'target'],
        });
      }
      // Edge de caminho de erro sem o node de origem ter onError:'branch'
      // habilitado nunca dispara na engine (roteamento e por handledFailures,
      // ver engine.service.ts) — vira dead code silencioso no grafo. O
      // editor limpa essa edge sozinho ao desabilitar o toggle
      // (flow-editor.tsx); isso aqui pega quem monta o grafo por outro
      // caminho (copilot, autocomplete, template, import).
      if (edge.sourceHandle === ERROR_HANDLE) {
        const source = nodesById.get(edge.source);
        if (source && source.onError !== 'branch') {
          ctx.addIssue({
            code: 'custom',
            message: `Edge de caminho de erro sem "Caminho de erro" habilitado no node de origem "${edge.source}".`,
            path: ['edges', index, 'sourceHandle'],
          });
        }
      }
    });
  },
);

export const EMPTY_GRAPH: WorkflowGraph = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
};
