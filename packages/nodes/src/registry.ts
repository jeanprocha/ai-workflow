import type { NodeDefinition } from "./types.js";
import { manualTriggerNode } from "./definitions/manual-trigger.js";
import { webhookTriggerNode } from "./definitions/webhook-trigger.js";
import { httpRequestNode } from "./definitions/http-request.js";
import { ifNode } from "./definitions/if.js";
import { setVariablesNode } from "./definitions/set-variables.js";
import { logNode } from "./definitions/log.js";

export const NODE_DEFINITIONS: readonly NodeDefinition<never>[] = [
  manualTriggerNode,
  webhookTriggerNode,
  httpRequestNode,
  ifNode,
  setVariablesNode,
  logNode,
] as unknown as NodeDefinition<never>[];

const registry = new Map<string, NodeDefinition<never>>(
  NODE_DEFINITIONS.map((definition) => [definition.type, definition]),
);

export function getNodeDefinition(type: string): NodeDefinition<never> | undefined {
  return registry.get(type);
}

export function listNodeDefinitions(): readonly NodeDefinition<never>[] {
  return NODE_DEFINITIONS;
}
