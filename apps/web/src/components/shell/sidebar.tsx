"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { Pulse } from "@workflow/ui";
import { NAV_GROUPS } from "@/lib/nav";
import { cn, focusRing } from "@/lib/utils";
import { useHasLiveExecution } from "@/hooks/use-executions";
import { useDictionary } from "@/lib/i18n";

export interface SidebarProps {
  /** Controla o drawer no mobile; no desktop a sidebar e sempre visivel. */
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

export function Sidebar({ mobileOpen, onMobileOpenChange }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const hasLiveExecution = useHasLiveExecution();
  const t = useDictionary();

  // Navegar fecha o drawer: sem isso o usuario clica num item no mobile e
  // fica olhando a propria sidebar em vez da tela que pediu.
  useEffect(() => {
    onMobileOpenChange(false);
  }, [pathname, onMobileOpenChange]);

  useEffect(() => {
    if (!mobileOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onMobileOpenChange(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen, onMobileOpenChange]);

  return (
    <>
      {mobileOpen && (
        <div
          role="presentation"
          onClick={() => onMobileOpenChange(false)}
          className="fixed inset-0 z-40 bg-background/80 md:hidden"
        />
      )}

      <aside
        className={cn(
          "flex h-full shrink-0 flex-col border-r border-border bg-card transition-[width,transform] duration-200 motion-reduce:transition-none",
          // Mobile: fora da tela por padrao, entra como drawer sobreposto.
          "fixed inset-y-0 left-0 z-50 w-60 md:static md:z-auto md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          collapsed ? "md:w-14" : "md:w-60",
        )}
      >
        <div
          className={cn(
            "flex h-12 items-center gap-2 px-4",
            collapsed && "md:justify-center md:px-0",
          )}
        >
          <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
            <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
          <span
            className={cn(
              "text-sm font-semibold tracking-tight text-foreground",
              collapsed && "md:hidden",
            )}
          >
            {t.nav.brand}
          </span>
          <button
            type="button"
            onClick={() => onMobileOpenChange(false)}
            aria-label={t.shell.closeNav}
            className={cn(
              "ml-auto grid h-10 w-10 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden",
              focusRing,
            )}
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.key ?? `group-${groupIndex}`} className="mb-3 space-y-0.5 last:mb-0">
              {group.key && (
                <p
                  className={cn(
                    "px-2.5 pb-1 pt-2 text-xs font-medium uppercase tracking-wider text-text-muted",
                    collapsed && "md:hidden",
                  )}
                >
                  {t.nav.groups[group.key]}
                </p>
              )}
              {group.items.map((item) => {
                const active = pathname.startsWith(item.href);
                const Icon = item.icon;
                const label = t.nav[item.key];
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? label : undefined}
                    className={cn(
                      // h-10 no mobile: alvo de toque confortavel; h-8 no
                      // desktop, onde a densidade importa mais que o dedo.
                      "relative flex h-10 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors md:h-8",
                      active
                        ? "bg-accent-subtle text-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      focusRing,
                      collapsed && "md:justify-center md:px-0",
                    )}
                  >
                    {active && (
                      <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary" />
                    )}
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                    <span className={cn("truncate", collapsed && "md:hidden")}>{label}</span>
                    {item.showLiveIndicator && hasLiveExecution && (
                      <Pulse
                        variant="dot"
                        size={6}
                        className={cn("ml-auto", collapsed && "md:hidden")}
                        ariaLabel={t.common.liveExecutionAriaLabel}
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="hidden border-t border-border p-2 md:block">
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            title={t.shell.collapse}
            className={cn(
              "flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              focusRing,
              collapsed && "justify-center px-0",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" strokeWidth={1.5} />
            ) : (
              <PanelLeftClose className="h-4 w-4" strokeWidth={1.5} />
            )}
            {!collapsed && <span>{t.shell.collapse}</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
