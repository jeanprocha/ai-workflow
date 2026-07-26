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
        // SEM onError global de mutation: o padrao da casa e try/catch em
        // volta de mutateAsync() com toast contextual no call site — e isso
        // e invisivel pra qualquer checagem aqui (mutation.options.onError
        // fica undefined mesmo com o erro sendo tratado pelo caller). Um
        // toast global de mutation duplicava TODO erro ja tratado — pego
        // pela suite E2E da Fase 02 (strict mode achou 2 toasts identicos).
        // Queries continuam cobertas acima: paginas nao tratam erro de
        // query individualmente, la o toast global e a unica sinalizacao.
        mutationCache: new MutationCache(),
      }),
  );

  useEffect(() => {
    initClientTelemetry();
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
