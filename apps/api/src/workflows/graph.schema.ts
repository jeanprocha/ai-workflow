import { z } from 'zod';
import type { WorkflowGraph } from '@workflow/shared';
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
    const nodeIds = new Set(graph.nodes.map((node) => node.id));

    graph.nodes.forEach((node, index) => {
      if (!getCatalogEntry(node.type)) {
        ctx.addIssue({
          code: 'custom',
          message: `Tipo de node desconhecido: "${node.type}".`,
          path: ['nodes', index, 'type'],
        });
      }
    });

    graph.edges.forEach((edge, index) => {
      if (!nodeIds.has(edge.source)) {
        ctx.addIssue({
          code: 'custom',
          message: `Edge referencia um node de origem inexistente: "${edge.source}".`,
          path: ['edges', index, 'source'],
        });
      }
      if (!nodeIds.has(edge.target)) {
        ctx.addIssue({
          code: 'custom',
          message: `Edge referencia um node de destino inexistente: "${edge.target}".`,
          path: ['edges', index, 'target'],
        });
      }
    });
  },
);

export const EMPTY_GRAPH: WorkflowGraph = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
};
