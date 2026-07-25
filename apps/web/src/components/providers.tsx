"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, errorMessage } from "@/lib/errors";
import { initClientTelemetry } from "@/lib/telemetry";

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: { suppressErrorToast?: boolean };
    mutationMeta: { suppressErrorToast?: boolean };
  }
}

/** 400/404 sao erros de dados/validacao — retentar nao muda o resultado, so atrasa o feedback pro usuario. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && (error.status === 400 || error.status === 404)) {
    return false;
  }
  return failureCount < 1;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: shouldRetry, refetchOnWindowFocus: false },
          mutations: { retry: false },
        },
        queryCache: new QueryCache({
          onError: (error, query) => {
            // Query com consumidor proprio de erro (ex.: pagina que ja
            // mostra um estado inline) marca `meta.suppressErrorToast` pra
            // nao duplicar feedback.
            if (query.meta?.suppressErrorToast) return;
            toast.error(errorMessage(error, "Erro inesperado."));
          },
        }),
        mutationCache: new MutationCache({
          onError: (error, _variables, _context, mutation) => {
            // A maioria das mutations ja tem seu proprio onError com toast
            // especifico (mensagem contextual). Sem essa checagem, TODA
            // mutation com onError proprio mostraria dois toasts (o dela +
            // este global) — o global so cobre as que NAO tratam o proprio
            // erro, como rede de seguranca.
            if (mutation.options.onError) return;
            if (mutation.meta?.suppressErrorToast) return;
            toast.error(errorMessage(error, "Erro inesperado."));
          },
        }),
      }),
  );

  useEffect(() => {
    initClientTelemetry();
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
