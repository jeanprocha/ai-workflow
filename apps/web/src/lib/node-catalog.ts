import { listNodeDefinitions } from "@workflow/nodes";
import type { NodeCategory } from "@workflow/shared";

export interface NodeCatalogEntry {
  type: string;
  category: NodeCategory;
  label: string;
  description: string;
  icon: string;
  outputs: readonly string[];
  defaultConfig: Record<string, unknown>;
}

export const NODE_CATALOG: NodeCatalogEntry[] = listNodeDefinitions().map((definition) => ({
  type: definition.type,
  category: definition.category,
  label: definition.label,
  description: definition.description,
  icon: definition.icon,
  outputs: definition.outputs,
  defaultConfig: definition.defaultConfig as Record<string, unknown>,
}));

export function getCatalogEntry(type: string): NodeCatalogEntry | undefined {
  return NODE_CATALOG.find((entry) => entry.type === type);
}

export const CATEGORY_LABELS: Record<NodeCategory, string> = {
  trigger: "Triggers",
  logic: "Logic",
  database: "Database",
  api: "APIs",
  file: "Files",
  ai: "AI",
  communication: "Communication",
};
