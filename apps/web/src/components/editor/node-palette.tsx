import { createElement } from "react";
import { NODE_CATALOG, CATEGORY_LABELS, type NodeCatalogEntry } from "@/lib/node-catalog";
import { getNodeIcon } from "@/lib/node-icons";
import type { NodeCategory } from "@workflow/shared";

function groupByCategory(
  entries: readonly NodeCatalogEntry[],
): Array<[NodeCategory, NodeCatalogEntry[]]> {
  const groups = new Map<NodeCategory, NodeCatalogEntry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.category) ?? [];
    list.push(entry);
    groups.set(entry.category, list);
  }
  return [...groups.entries()];
}

function onDragStart(event: React.DragEvent, nodeType: string) {
  event.dataTransfer.setData("application/x-workflow-node", nodeType);
  event.dataTransfer.effectAllowed = "move";
}

export function NodePalette() {
  const groups = groupByCategory(NODE_CATALOG);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-card">
      <div className="border-b border-border px-3 py-2.5">
        <h2 className="text-sm font-medium text-foreground">Nodes</h2>
        <p className="text-xs text-muted-foreground">Arraste para o canvas.</p>
      </div>
      <div className="flex-1 space-y-4 p-3">
        {groups.map(([category, entries]) => (
          <div key={category}>
            <p className="mb-1.5 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {CATEGORY_LABELS[category]}
            </p>
            <div className="space-y-1">
              {entries.map((entry) => (
                <div
                  key={entry.type}
                  draggable
                  onDragStart={(event) => onDragStart(event, entry.type)}
                  title={entry.description}
                  className="flex cursor-grab items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-sm text-foreground transition-colors hover:border-border hover:bg-accent active:cursor-grabbing"
                >
                  {createElement(getNodeIcon(entry.icon), {
                    className: "h-4 w-4 shrink-0 text-muted-foreground",
                    strokeWidth: 1.5,
                  })}
                  <span className="truncate">{entry.label}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
