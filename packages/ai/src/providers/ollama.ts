import type {
  AIProvider,
  ChatOptions,
  ChatResult,
  EmbedOptions,
  EmbedResult,
} from "../types.js";

interface OllamaChatResponse {
  message: { role: string; content: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaEmbedResponse {
  embeddings: number[][];
}

function baseUrl(): string {
  return process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
}

/** Ollama roda local — "apiKey" e ignorada (mantida so para respeitar a interface comum). */
export const ollamaProvider: AIProvider = {
  name: "ollama",

  async chat(options: ChatOptions): Promise<ChatResult> {
    const response = await fetch(`${baseUrl()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: options.model,
        stream: false,
        messages: options.messages.map((m) => ({ role: m.role, content: m.content })),
        options: { temperature: options.temperature },
        format: options.outputSchema ?? undefined,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama retornou status ${response.status}. Ele esta rodando localmente?`);
    }

    const body = (await response.json()) as OllamaChatResponse;
    const usage = {
      inputTokens: body.prompt_eval_count ?? 0,
      outputTokens: body.eval_count ?? 0,
    };

    return {
      content: body.message.content,
      toolCalls: [],
      usage,
      costUsd: 0,
      model: options.model,
    };
  },

  async embed(options: EmbedOptions): Promise<EmbedResult> {
    const inputs = Array.isArray(options.input) ? options.input : [options.input];
    const response = await fetch(`${baseUrl()}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: options.model, input: inputs }),
    });

    if (!response.ok) {
      throw new Error(`Ollama retornou status ${response.status}. Ele esta rodando localmente?`);
    }

    const body = (await response.json()) as OllamaEmbedResponse;
    return { embeddings: body.embeddings, usage: { tokens: 0 }, costUsd: 0, model: options.model };
  },
};
