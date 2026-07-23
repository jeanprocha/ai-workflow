import { z } from 'zod';
import type { WorkflowGraph } from '@workflow/shared';

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

export const workflowGraphSchema = z.object({
  nodes: z.array(workflowNodeSchema),
  edges: z.array(workflowEdgeSchema),
  viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number() }),
}) satisfies z.ZodType<WorkflowGraph>;

export const EMPTY_GRAPH: WorkflowGraph = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
};
