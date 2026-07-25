import { NODE_CATALOG, getCatalogEntry, type NodeCatalogEntry } from "@workflow/nodes/catalog";
import type { NodeCategory } from "@workflow/shared";
import type { Dictionary } from "./i18n/dictionary";

export { NODE_CATALOG, getCatalogEntry };
export type { NodeCatalogEntry };

/** @deprecated use `t.nodeCatalog.categories` (via useDictionary()) */
export const CATEGORY_LABELS: Record<NodeCategory, string> = {
  trigger: "Triggers",
  logic: "Logic",
  database: "Database",
  api: "APIs",
  file: "Files",
  ai: "AI",
  communication: "Communication",
};

/**
 * Descricao localizada de um node do catalogo. `entry.description` (vindo de
 * @workflow/nodes) e sempre pt-BR — cai como fallback se o `type` nao tiver
 * entrada no dicionario (ex.: node novo ainda nao traduzido).
 */
export function getNodeDescription(entry: NodeCatalogEntry, t: Dictionary): string {
  const descriptions: Record<string, string> = t.nodeCatalog.descriptions;
  return descriptions[entry.type] ?? entry.description;
}
