import { NODE_CATALOG, getCatalogEntry, type NodeCatalogEntry } from "@workflow/nodes/catalog";
import type { NodeCategory } from "@workflow/shared";

export { NODE_CATALOG, getCatalogEntry };
export type { NodeCatalogEntry };

export const CATEGORY_LABELS: Record<NodeCategory, string> = {
  trigger: "Triggers",
  logic: "Logic",
  database: "Database",
  api: "APIs",
  file: "Files",
  ai: "AI",
  communication: "Communication",
};
