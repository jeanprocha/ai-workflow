import {
  LayoutDashboard,
  Workflow,
  Bot,
  ListChecks,
  BookOpen,
  LayoutTemplate,
  Store,
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
  { label: "Knowledge", href: "/knowledge", icon: BookOpen },
  { label: "Templates", href: "/templates", icon: LayoutTemplate },
  { label: "Marketplace", href: "/marketplace", icon: Store },
  { label: "Settings", href: "/settings", icon: Settings },
];
