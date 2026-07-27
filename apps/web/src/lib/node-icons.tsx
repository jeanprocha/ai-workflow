import {
  Play,
  Webhook,
  Globe,
  GitBranch,
  Variable,
  Terminal,
  Box,
  MessagesSquare,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";

/** Mapa explicito nome-do-icone (definido em @workflow/nodes) -> componente lucide. */
const ICONS: Record<string, LucideIcon> = {
  Play,
  Webhook,
  Globe,
  GitBranch,
  Variable,
  Terminal,
  MessagesSquare,
  MessageSquare,
};

export function getNodeIcon(name: string): LucideIcon {
  return ICONS[name] ?? Box;
}
