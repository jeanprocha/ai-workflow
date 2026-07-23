import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
            <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
          <span className="text-sm font-semibold tracking-tight text-foreground">
            Workflow AI
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
