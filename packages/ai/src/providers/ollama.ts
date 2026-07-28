import type {
  AIProvider,
  ChatOptions,
  ChatResult,
  EmbedOptions,
  EmbedResult,
  ToolCall,
} from "../types.js";

interface OllamaToolCall {
  function: { name: string; arguments: Record<string, unknown> };
}

interface OllamaChatResponse {
  message: { role: string; content: string; tool_calls?: OllamaToolCall[] };
  prompt_eval_count?: number;
  eval_count?: number;
}

/** Mapeia o historico comum pro formato Ollama (OpenAI-like, sem tool_call_id). */
function toOllamaMessage(message: ChatOptions["messages"][number]) {
  if (message.role === "assistant" && message.toolCalls?.length) {
    return {
      role: "assistant",
      content: message.content,
      tool_calls: message.toolCalls.map((call) => ({
        function: { name: call.name, arguments: call.arguments },
      })),
    };
  }
  return { role: message.role, content: message.content };
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
        messages: options.messages.map(toOllamaMessage),
        tools: options.tools?.map((tool) => ({
          type: "function",
          function: { name: tool.name, description: tool.description, parameters: tool.parameters },
        })),
        options: { temperature: options.temperature },
        format: options.outputSchema ?? undefined,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      if (options.tools?.length && /does not support tools/i.test(errorBody)) {
        throw new Error(
          `O modelo "${options.model}" nao suporta tools no Ollama. Use um modelo com suporte (ex.: llama3.1, qwen2.5, mistral).`,
        );
      }
      throw new Error(`Ollama retornou status ${response.status}. Ele esta rodando localmente?`);
    }

    const body = (await response.json()) as OllamaChatResponse;
    const usage = {
      inputTokens: body.prompt_eval_count ?? 0,
      outputTokens: body.eval_count ?? 0,
    };
    const toolCalls: ToolCall[] = (body.message.tool_calls ?? []).map((call, index) => ({
      id: `${call.function.name}:${index}`,
      name: call.function.name,
      arguments: call.function.arguments,
    }));

    return {
      content: body.message.content,
      toolCalls,
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
