import OpenAI from "openai";
import type {
  AIProvider,
  ChatOptions,
  ChatResult,
  EmbedOptions,
  EmbedResult,
  ToolCall,
} from "../types.js";
import { estimateCostUsd } from "../models.js";
import { toStrictJsonSchema } from "../schema-utils.js";

function toOpenAiMessage(
  message: ChatOptions["messages"][number],
): OpenAI.Chat.ChatCompletionMessageParam {
  if (message.role === "tool") {
    return { role: "tool", tool_call_id: message.toolCallId ?? "", content: message.content };
  }

  if (message.role === "assistant" && message.toolCalls?.length) {
    return {
      role: "assistant",
      content: message.content || null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: JSON.stringify(call.arguments) },
      })),
    };
  }

  const content = message.imageUrl
    ? [
        { type: "text" as const, text: message.content },
        { type: "image_url" as const, image_url: { url: message.imageUrl } },
      ]
    : message.content;

  return { role: message.role === "system" ? "system" : "user", content } as OpenAI.Chat.ChatCompletionMessageParam;
}

export const openaiProvider: AIProvider = {
  name: "openai",

  async chat(options: ChatOptions): Promise<ChatResult> {
    const client = new OpenAI({ apiKey: options.apiKey });

    const response = await client.chat.completions.create({
      model: options.model,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      messages: options.messages.map(toOpenAiMessage),
      tools: options.tools?.map((tool) => ({
        type: "function" as const,
        function: { name: tool.name, description: tool.description, parameters: tool.parameters },
      })),
      response_format: options.outputSchema
        ? {
            type: "json_schema",
            json_schema: {
              name: "output",
              schema: toStrictJsonSchema(options.outputSchema) as Record<string, unknown>,
              strict: true,
            },
          }
        : undefined,
    });

    const choice = response.choices[0];
    const toolCalls: ToolCall[] = (choice?.message.tool_calls ?? [])
      .filter((call) => call.type === "function")
      .map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: JSON.parse(call.function.arguments) as Record<string, unknown>,
      }));

    const usage = {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    };

    return {
      content: choice?.message.content ?? "",
      toolCalls,
      usage,
      costUsd: estimateCostUsd(options.model, usage.inputTokens, usage.outputTokens),
      model: options.model,
    };
  },

  async embed(options: EmbedOptions): Promise<EmbedResult> {
    const client = new OpenAI({ apiKey: options.apiKey });
    const response = await client.embeddings.create({
      model: options.model,
      input: options.input,
    });

    return {
      embeddings: response.data.map((item) => item.embedding),
      usage: { tokens: response.usage.total_tokens },
      costUsd: estimateCostUsd(options.model, response.usage.total_tokens, 0),
      model: options.model,
    };
  },
};
