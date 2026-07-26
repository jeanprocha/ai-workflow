"use client";

import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { useDictionary } from "@/lib/i18n";
import { cn, focusRing } from "@/lib/utils";
import { useIsMac } from "@/hooks/use-platform";

export interface TopbarProps {
  onSearchClick: () => void;
  onNavClick: () => void;
}

export function Topbar({ onSearchClick, onNavClick }: TopbarProps) {
  const pathname = usePathname();
  const current = NAV_ITEMS.find((item) => pathname.startsWith(item.href));
  const t = useDictionary();
  const isMac = useIsMac();

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-2 md:px-4">
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          onClick={onNavClick}
          aria-label={t.shell.openNav}
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden",
            focusRing,
          )}
        >
          <Menu className="h-4 w-4" strokeWidth={1.5} />
        </button>
        <nav
          aria-label={t.shell.breadcrumbLabel}
          className="min-w-0 text-sm text-muted-foreground"
        >
          <span className="block truncate text-foreground">
            {current ? t.nav[current.key] : t.nav.brand}
          </span>
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-1 md:gap-2">
        {/* Mobile: so o icone (o campo de 256px nao cabe); desktop: campo cheio. */}
        <button
          type="button"
          onClick={onSearchClick}
          aria-label={t.shell.searchPlaceholder}
          className={cn(
            "grid h-10 w-10 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden",
            focusRing,
          )}
        >
          <Search className="h-4 w-4" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={onSearchClick}
          className={cn(
            "hidden h-8 w-64 items-center gap-2 rounded-md border border-border bg-background px-2.5 text-sm text-muted-foreground transition-colors hover:border-border-strong md:flex",
            focusRing,
          )}
        >
          <Search className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span className="flex-1 truncate text-left">{t.shell.searchPlaceholder}</span>
          <kbd className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            {isMac ? "⌘K" : "Ctrl K"}
          </kbd>
        </button>
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
