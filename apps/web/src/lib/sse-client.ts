import { getAccessToken, getWorkspaceId } from "./auth-storage";
import { tryRefresh } from "./api-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

const BASE_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
/** 3x o intervalo do heartbeat "ping" do servidor (15s, ver observability Fase 4) — 1-2 pings perdidos e tolerado, 3 e queda. */
const PING_WATCHDOG_MS = 45_000;
const WATCHDOG_CHECK_INTERVAL_MS = 5_000;

export type SseConnectionStatus = "connecting" | "open" | "reconnecting" | "closed";

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

/** @returns true se o stream terminou porque a execucao completou (nao precisa reconectar). */
async function connectOnce<T extends { type: string }>(
  path: string,
  onEvent: (data: T) => void,
  signal: AbortSignal,
  onOpen: () => void,
): Promise<boolean> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${getAccessToken() ?? ""}`,
      "x-workspace-id": getWorkspaceId() ?? "",
    },
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`Falha ao abrir o stream (status ${response.status}).`);
  }
  onOpen();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;
  let lastActivityAt = Date.now();

  // Sem heartbeat "ping" (a cada 15s, Fase 4) por muito tempo == conexao
  // morta que o browser nao percebeu sozinho (proxy/LB pode derrubar sem
  // fechar o socket do lado do client) — forca o fim deste attempt via
  // reader.cancel() pra cair no reconnect do streamSse().
  const watchdog = setInterval(() => {
    if (Date.now() - lastActivityAt > PING_WATCHDOG_MS) {
      void reader.cancel(new Error("SSE watchdog: sem atividade ha 45s."));
    }
  }, WATCHDOG_CHECK_INTERVAL_MS);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      lastActivityAt = Date.now();

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const dataLine = frame.split("\n").find((line) => line.startsWith("data:"));
        if (!dataLine) continue;
        try {
          const parsed = JSON.parse(dataLine.slice("data:".length).trim()) as T;
          if (parsed.type === "ping") continue;
          onEvent(parsed);
          if (parsed.type === "execution.completed") completed = true;
        } catch {
          // frame malformado, ignora
        }
      }
    }
  } finally {
    clearInterval(watchdog);
  }

  return completed;
}

/**
 * Consome um endpoint text/event-stream via fetch (nao EventSource) porque
 * EventSource nao suporta headers customizados (Authorization, x-workspace-id).
 * Reconecta sozinho com backoff exponencial (1s -> 30s, com jitter pra nao
 * sincronizar reconexoes de multiplas abas) enquanto a execucao nao tiver
 * terminado e o signal nao tiver sido abortado — cobre queda de proxy/LB,
 * sleep de aba em background, timeout de rede, sem exigir que quem consome
 * o hook saiba nada sobre isso.
 */
export async function streamSse<T extends { type: string }>(
  path: string,
  onEvent: (data: T) => void,
  signal: AbortSignal,
  onConnectionChange?: (status: SseConnectionStatus) => void,
): Promise<void> {
  let attempt = 0;

  while (!signal.aborted) {
    onConnectionChange?.(attempt === 0 ? "connecting" : "reconnecting");

    if (attempt > 0) {
      // O token pode ter expirado durante o tempo em que a conexao ficou
      // caida — renova ANTES de tentar de novo pra nao abrir e imediatamente
      // levar 401 (o stream nao passa pelo fluxo de refresh do apiFetch).
      await tryRefresh().catch(() => {});
    }

    try {
      const completed = await connectOnce<T>(path, onEvent, signal, () => {
        onConnectionChange?.("open");
      });
      if (completed) {
        onConnectionChange?.("closed");
        return;
      }
    } catch {
      // conexao caiu antes de completar — cai pro reconnect abaixo
    }

    if (signal.aborted) return;

    attempt += 1;
    const delay = Math.min(BASE_RECONNECT_DELAY_MS * 2 ** (attempt - 1), MAX_RECONNECT_DELAY_MS);
    const jitter = delay * (0.5 + Math.random() * 0.5);
    await sleep(jitter, signal);
  }
}
