import type { ReactNode } from "react";
import { Pulse } from "./pulse";

export interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
}

/**
 * Empty state = convite a acao, nunca so constatacao (style.md 9.1).
 */
export function EmptyState({ title, description, action, secondaryAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <Pulse variant="bar" className="w-24 rounded-full" />
      <div className="space-y-1">
        <h3 className="text-md font-medium text-foreground">{title}</h3>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {(action || secondaryAction) && (
        <div className="mt-2 flex items-center gap-3">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
