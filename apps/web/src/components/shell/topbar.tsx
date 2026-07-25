"use client";

import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { useDictionary } from "@/lib/i18n";

export interface TopbarProps {
  onSearchClick: () => void;
}

export function Topbar({ onSearchClick }: TopbarProps) {
  const pathname = usePathname();
  const current = NAV_ITEMS.find((item) => pathname.startsWith(item.href));
  const t = useDictionary();

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
      <nav aria-label={t.shell.breadcrumbLabel} className="text-sm text-muted-foreground">
        <span className="text-foreground">{current ? t.nav[current.key] : t.nav.brand}</span>
      </nav>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSearchClick}
          className="flex h-8 w-64 items-center gap-2 rounded-md border border-border bg-background px-2.5 text-sm text-muted-foreground transition-colors hover:border-border-strong"
        >
          <Search className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span className="flex-1 text-left">{t.shell.searchPlaceholder}</span>
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </button>
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
