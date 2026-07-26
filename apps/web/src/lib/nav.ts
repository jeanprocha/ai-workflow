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
export type NavKey = Exclude<keyof typeof navDict, "brand" | "groups">;

export type NavGroupKey = keyof typeof navDict.groups;

export interface NavItem {
  key: NavKey;
  href: string;
  icon: LucideIcon;
  /** Mostra o indicador de execucao ao vivo (Pulse) ao lado do item. */
  showLiveIndicator?: boolean;
}

export interface NavGroup {
  /** Sem `key`: grupo sem cabecalho (Dashboard no topo, Configuracoes no rodape). */
  key?: NavGroupKey;
  items: NavItem[];
}

/**
 * Agrupado de proposito: 10 itens planos passam do limite confortavel de
 * leitura (~4 por grupo). Os titulos separam o que o usuario esta fazendo —
 * construir a automacao, operar o que ja roda, e os recursos que alimentam
 * as duas coisas.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ key: "dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    key: "build",
    items: [
      { key: "flows", href: "/flows", icon: Workflow },
      { key: "templates", href: "/templates", icon: LayoutTemplate },
      { key: "agents", href: "/agents", icon: Bot },
    ],
  },
  {
    key: "operate",
    items: [
      { key: "executions", href: "/executions", icon: ListChecks, showLiveIndicator: true },
      { key: "analytics", href: "/analytics", icon: BarChart3 },
      { key: "costOptimizer", href: "/cost-optimizer", icon: PiggyBank },
    ],
  },
  {
    key: "resources",
    items: [
      { key: "knowledge", href: "/knowledge", icon: BookOpen },
      { key: "mcp", href: "/mcp", icon: Plug },
    ],
  },
  {
    items: [{ key: "settings", href: "/settings", icon: Settings }],
  },
];

/** Lista plana — usada por quem so precisa resolver href/label (topbar, command palette). */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);
