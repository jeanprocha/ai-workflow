import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const configSchema = z.object({});
type Config = z.infer<typeof configSchema>;

/**
 * Entrada do fluxo de tratamento de erro (H2-05, Workflow.errorWorkflowId).
 * Passthrough puro, igual aos outros triggers — o input e o payload que o
 * ErrorWorkflowService monta a partir da execucao que falhou:
 * { workflowId, workflowName, executionId, error, failedNodeId, triggerType, timestamp }.
 */
export const errorTriggerNode: NodeDefinition<Config> = {
  type: "trigger.error",
  category: "trigger",
  label: "Error Trigger",
  description:
    "Inicia o fluxo quando outro fluxo (que aponta pra este como error workflow) falha. O input traz workflowId/workflowName/executionId/error/failedNodeId de quem falhou.",
  icon: "ShieldAlert",
  outputs: ["default"],
  configSchema,
  defaultConfig: {},
  execute: (ctx) => ({ output: ctx.input }),
};
