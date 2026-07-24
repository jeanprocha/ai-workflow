export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** Para mensagens do usuario com imagem (node Vision/OCR): URL ou data URI. */
  imageUrl?: string;
  /** role="assistant": as tools que o modelo decidiu chamar nesta mensagem. */
  toolCalls?: ToolCall[];
  /** role="tool": a qual chamada (ToolCall.id) esta resposta corresponde. */
  toolCallId?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema dos parametros da tool. */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatOptions {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  /** JSON Schema — quando presente, o provider forca saida estruturada nesse formato. */
  outputSchema?: Record<string, unknown>;
}

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ChatResult {
  content: string;
  toolCalls: ToolCall[];
  usage: ChatUsage;
  costUsd: number;
  model: string;
}

export interface EmbedOptions {
  apiKey: string;
  model: string;
  input: string | string[];
}

export interface EmbedResult {
  embeddings: number[][];
  usage: { tokens: number };
  costUsd: number;
  model: string;
}

export interface AIProvider {
  name: "openai" | "anthropic" | "gemini" | "ollama";
  chat(options: ChatOptions): Promise<ChatResult>;
  embed(options: EmbedOptions): Promise<EmbedResult>;
}
