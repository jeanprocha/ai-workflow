"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { useDictionary } from "@/lib/i18n";
import { ApiError } from "@/lib/errors";
import { reportClientError } from "@/lib/telemetry";
import "./globals.css";

const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var theme = stored === "light" || stored === "dark" ? stored : "dark";
    document.documentElement.classList.add(theme);
  } catch (e) {
    document.documentElement.classList.add("dark");
  }
})();
`;

/**
 * Ultimo nivel de defesa (raiz do app inteiro) — so ativa quando um erro
 * escapa de TODOS os error.tsx aninhados, incluindo o proprio RootLayout.
 * Por isso substitui <html>/<body> por completo e nao pode depender de
 * Providers (QueryClientProvider, Toaster, tema via classe ja aplicada) —
 * cada coisa que precisa e reconstruida aqui, standalone.
 */
export default function GlobalError({
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
    // H1.4: canal complementar ao /telemetry/client-errors acima — sem
    // NEXT_PUBLIC_SENTRY_DSN configurada, Sentry.captureException e no-op.
    Sentry.captureException(error);
  }, [error]);

  const retry = unstable_retry ?? reset;

  return (
    <html lang="pt-BR" className="dark antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-screen w-full items-center justify-center bg-background px-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">{t.errors.global.title}</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              {t.errors.global.description}
            </p>
          </div>
          {retry && (
            <button
              type="button"
              onClick={() => retry()}
              className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted"
            >
              {t.errors.global.retry}
            </button>
          )}
        </div>
      </body>
    </html>
  );
}
