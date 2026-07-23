import { getAccessToken, getWorkspaceId } from "./auth-storage";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

/**
 * Consome um endpoint text/event-stream via fetch (nao EventSource) porque
 * EventSource nao suporta headers customizados (Authorization, x-workspace-id).
 */
export async function streamSse<T>(
  path: string,
  onEvent: (data: T) => void,
  signal: AbortSignal,
): Promise<void> {
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

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const dataLine = frame.split("\n").find((line) => line.startsWith("data:"));
      if (!dataLine) continue;
      try {
        onEvent(JSON.parse(dataLine.slice("data:".length).trim()) as T);
      } catch {
        // frame malformado, ignora
      }
    }
  }
}
