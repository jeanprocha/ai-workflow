import Anthropic from "@anthropic-ai/sdk";
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

function toAnthropicMessage(message: ChatOptions["messages"][number]): Anthropic.MessageParam {
  if (message.role === "tool") {
    return {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: message.toolCallId ?? "",
          content: message.content,
        },
      ],
    };
  }

  if (message.role === "assistant" && message.toolCalls?.length) {
    return {
      role: "assistant",
      content: [
        ...(message.content ? [{ type: "text" as const, text: message.content }] : []),
        ...message.toolCalls.map((call) => ({
          type: "tool_use" as const,
          id: call.id,
          name: call.name,
          input: call.arguments,
        })),
      ],
    };
  }

  const role = message.role === "assistant" ? "assistant" : "user";
  if (!message.imageUrl) return { role, content: message.content };
  return {
    role,
    content: [
      { type: "text" as const, text: message.content },
      { type: "image" as const, source: { type: "url" as const, url: message.imageUrl } },
    ],
  };
}

export const anthropicProvider: AIProvider = {
  name: "anthropic",

  async chat(options: ChatOptions): Promise<ChatResult> {
    const client = new Anthropic({ apiKey: options.apiKey });

    const systemMessages = options.messages.filter((m) => m.role === "system");
    const conversation = options.messages.filter((m) => m.role !== "system");

    const baseRequest: Omit<Anthropic.MessageCreateParamsNonStreaming, "temperature"> = {
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      system: systemMessages.map((m) => m.content).join("\n\n") || undefined,
      messages: conversation.map(toAnthropicMessage),
      tools: options.tools?.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters as Anthropic.Tool.InputSchema,
      })),
      output_config: options.outputSchema
        ? { format: { type: "json_schema" as const, schema: toStrictJsonSchema(options.outputSchema) as Record<string, unknown> } }
        : undefined,
    };

    let response: Anthropic.Message;
    try {
      response = await client.messages.create({ ...baseRequest, temperature: options.temperature });
    } catch (error) {
      // Modelos mais novos (ex. claude-sonnet-5) nao aceitam customizar
      // temperature — a API responde 400 "temperature is deprecated for
      // this model". Refaz sem o parametro em vez de propagar o erro (500)
      // pro usuario por causa de um valor default (0.7) que ele nem
      // escolheu explicitamente.
      const isTemperatureDeprecated =
        options.temperature !== undefined &&
        error instanceof Anthropic.APIError &&
        error.status === 400 &&
        error.message.includes("temperature") &&
        error.message.includes("deprecated");
      if (!isTemperatureDeprecated) throw error;
      response = await client.messages.create(baseRequest);
    }

    let content = "";
    const toolCalls: ToolCall[] = [];
    for (const block of response.content) {
      if (block.type === "text") content += block.text;
      if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        });
      }
    }

    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };

    return {
      content,
      toolCalls,
      usage,
      costUsd: estimateCostUsd(options.model, usage.inputTokens, usage.outputTokens),
      model: options.model,
    };
  },

  async embed(options: EmbedOptions): Promise<EmbedResult> {
    void options;
    throw new Error(
      "Anthropic nao expoe uma API de embeddings publica — use OpenAI, Gemini ou Ollama para o node Embeddings.",
    );
  },
};
