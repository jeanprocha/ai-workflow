"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Pulse } from "@workflow/ui";
import { NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { useHasLiveExecution } from "@/hooks/use-executions";

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const hasLiveExecution = useHasLiveExecution();

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-border bg-card transition-[width] duration-200",
        collapsed ? "w-14" : "w-60",
      )}
    >
      <div className={cn("flex h-12 items-center gap-2 px-4", collapsed && "justify-center px-0")}>
        <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
          <span className="relative h-1.5 w-1.5 rounded-full bg-primary" />
        </span>
        {!collapsed && (
          <span className="text-sm font-semibold tracking-tight text-foreground">
            Workflow AI
          </span>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 px-2 py-2">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors",
                active
                  ? "bg-accent-subtle text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
                collapsed && "justify-center px-0",
              )}
            >
              {active && (
                <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary" />
              )}
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              {!collapsed && <span className="truncate">{item.label}</span>}
              {!collapsed && item.showLiveIndicator && hasLiveExecution && (
                <Pulse variant="dot" size={6} className="ml-auto" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-2">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className={cn(
            "flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" strokeWidth={1.5} />
          ) : (
            <PanelLeftClose className="h-4 w-4" strokeWidth={1.5} />
          )}
          {!collapsed && <span>Recolher</span>}
        </button>
      </div>
    </aside>
  );
}
