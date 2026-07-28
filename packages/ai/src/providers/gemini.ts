import { GoogleGenerativeAI, type Content, type Part } from "@google/generative-ai";
import type {
  AIProvider,
  ChatOptions,
  ChatResult,
  EmbedOptions,
  EmbedResult,
  ToolCall,
} from "../types.js";
import { estimateCostUsd } from "../models.js";

/** Extrai o nome da tool de um id sintetico "{name}:{index}" (Gemini nao devolve id). */
function toolNameFromId(id: string): string {
  return id.slice(0, id.lastIndexOf(":"));
}

function toParts(message: ChatOptions["messages"][number]): Part[] {
  if (message.role === "assistant" && message.toolCalls?.length) {
    const parts: Part[] = [];
    if (message.content) parts.push({ text: message.content });
    for (const call of message.toolCalls) {
      parts.push({ functionCall: { name: call.name, args: call.arguments } });
    }
    return parts;
  }

  if (message.role === "tool") {
    let response: object;
    try {
      response = JSON.parse(message.content) as object;
    } catch {
      response = { result: message.content };
    }
    return [
      {
        functionResponse: {
          name: toolNameFromId(message.toolCallId ?? ""),
          response,
        },
      },
    ];
  }

  const parts: Part[] = [{ text: message.content }];
  if (message.imageUrl) {
    parts.push({ fileData: { fileUri: message.imageUrl, mimeType: "image/png" } });
  }
  return parts;
}

export const geminiProvider: AIProvider = {
  name: "gemini",

  async chat(options: ChatOptions): Promise<ChatResult> {
    const client = new GoogleGenerativeAI(options.apiKey);
    const systemInstruction = options.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");

    const model = client.getGenerativeModel({
      model: options.model,
      systemInstruction: systemInstruction || undefined,
      // A API rejeita responseSchema junto de tools no mesmo request — o loop
      // de agentes (unico consumidor de `tools`) nunca passa outputSchema.
      tools: options.tools?.length
        ? [
            {
              functionDeclarations: options.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters as never,
              })),
            },
          ]
        : undefined,
      generationConfig: {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
        ...(options.outputSchema
          ? {
              responseMimeType: "application/json",
              // Gemini usa um formato de schema proprio (OpenAPI-like); JSON Schema
              // simples costuma ser compativel na pratica para os casos comuns.
              responseSchema: options.outputSchema as never,
            }
          : {}),
      },
    });

    const contents: Content[] = options.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : m.role === "tool" ? "function" : "user",
        parts: toParts(m),
      }));

    const result = await model.generateContent({ contents });
    const usage = {
      inputTokens: result.response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: result.response.usageMetadata?.candidatesTokenCount ?? 0,
    };
    const toolCalls: ToolCall[] = (result.response.functionCalls() ?? []).map((call, index) => ({
      id: `${call.name}:${index}`,
      name: call.name,
      arguments: call.args as Record<string, unknown>,
    }));

    return {
      content: result.response.text(),
      toolCalls,
      usage,
      costUsd: estimateCostUsd(options.model, usage.inputTokens, usage.outputTokens),
      model: options.model,
    };
  },

  async embed(options: EmbedOptions): Promise<EmbedResult> {
    const client = new GoogleGenerativeAI(options.apiKey);
    const model = client.getGenerativeModel({ model: options.model });
    const inputs = Array.isArray(options.input) ? options.input : [options.input];

    const embeddings: number[][] = [];
    for (const text of inputs) {
      const result = await model.embedContent(text);
      embeddings.push(result.embedding.values);
    }

    return {
      embeddings,
      usage: { tokens: 0 },
      costUsd: 0,
      model: options.model,
    };
  },
};
