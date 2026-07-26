"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { CommandPalette } from "./command-palette";
import { PageTransition } from "./page-transition";

export function AppShell({ children }: { children: ReactNode }) {
  const [commandOpen, setCommandOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar mobileOpen={navOpen} onMobileOpenChange={setNavOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onSearchClick={() => setCommandOpen(true)} onNavClick={() => setNavOpen(true)} />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  );
}
