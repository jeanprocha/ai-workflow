"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDictionary } from "@/lib/i18n";
import { ApiError } from "@/lib/errors";
import { reportClientError } from "@/lib/telemetry";

/**
 * Editor de fluxo (700+ linhas em flow-editor.tsx) era a unica tela sem
 * nenhuma protecao contra crash de render — um erro ali derrubava a app
 * inteira sem feedback algum pro usuario. As alteracoes ja salvas (grafo
 * persistido via saveGraph) nao sao afetadas por um crash de render.
 */
export default function FlowEditorError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
}) {
  const t = useDictionary();

  useEffect(() => {
    reportClientError({
      kind: "error",
      message: error.message,
      stack: error.stack,
      requestId: error instanceof ApiError ? error.requestId : undefined,
    });
  }, [error]);

  const retry = unstable_retry ?? reset;

  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-4 px-4 text-center">
      <TriangleAlertIcon className="size-8 text-destructive" />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">
          {t.errors.editorBoundary.title}
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {t.errors.editorBoundary.description}
        </p>
      </div>
      <div className="flex gap-2">
        {retry && (
          <Button variant="outline" onClick={() => retry()}>
            {t.errors.editorBoundary.retry}
          </Button>
        )}
        <Button render={<Link href="/flows" />}>{t.errors.editorBoundary.backToFlows}</Button>
      </div>
    </div>
  );
}
