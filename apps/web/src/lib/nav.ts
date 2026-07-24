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
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Mostra o indicador de execucao ao vivo (Pulse) ao lado do item. */
  showLiveIndicator?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Flows", href: "/flows", icon: Workflow },
  { label: "Agents", href: "/agents", icon: Bot },
  { label: "Executions", href: "/executions", icon: ListChecks, showLiveIndicator: true },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Knowledge", href: "/knowledge", icon: BookOpen },
  { label: "MCP", href: "/mcp", icon: Plug },
  { label: "Templates", href: "/templates", icon: LayoutTemplate },
  { label: "Settings", href: "/settings", icon: Settings },
];
