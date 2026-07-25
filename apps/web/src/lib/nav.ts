import {
  LayoutDashboard,
  Workflow,
  Bot,
  ListChecks,
  BookOpen,
  LayoutTemplate,
  BarChart3,
  Plug,
  Settings,
  PiggyBank,
  type LucideIcon,
} from "lucide-react";
import type { pt as navDict } from "./i18n/dictionaries/nav";

/** Chave do dicionario `nav` (dictionaries/nav.ts) — texto exibido resolvido no componente, nao aqui. */
export type NavKey = Exclude<keyof typeof navDict, "brand">;

export interface NavItem {
  key: NavKey;
  href: string;
  icon: LucideIcon;
  /** Mostra o indicador de execucao ao vivo (Pulse) ao lado do item. */
  showLiveIndicator?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", href: "/dashboard", icon: LayoutDashboard },
  { key: "flows", href: "/flows", icon: Workflow },
  { key: "agents", href: "/agents", icon: Bot },
  { key: "executions", href: "/executions", icon: ListChecks, showLiveIndicator: true },
  { key: "analytics", href: "/analytics", icon: BarChart3 },
  { key: "costOptimizer", href: "/cost-optimizer", icon: PiggyBank },
  { key: "knowledge", href: "/knowledge", icon: BookOpen },
  { key: "mcp", href: "/mcp", icon: Plug },
  { key: "templates", href: "/templates", icon: LayoutTemplate },
  { key: "settings", href: "/settings", icon: Settings },
];
