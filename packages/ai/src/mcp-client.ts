import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export type McpTransportKind = "stdio" | "sse" | "http";

export interface McpStdioConfig {
  transport: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpRemoteConfig {
  transport: "sse" | "http";
  url: string;
  headers?: Record<string, string>;
}

export type McpConnectionConfig = McpStdioConfig | McpRemoteConfig;

export interface McpToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Cliente MCP conectado — o chamador e responsavel por fechar via close(). */
export async function connectMcpServer(config: McpConnectionConfig): Promise<Client> {
  const client = new Client({ name: "workflow-ai-platform", version: "1.0.0" }, { capabilities: {} });

  const transport =
    config.transport === "stdio"
      ? new StdioClientTransport({ command: config.command, args: config.args, env: config.env })
      : config.transport === "sse"
        ? new SSEClientTransport(
            new URL(config.url),
            config.headers ? { requestInit: { headers: config.headers } } : undefined,
          )
        : new StreamableHTTPClientTransport(
            new URL(config.url),
            config.headers ? { requestInit: { headers: config.headers } } : undefined,
          );

  await client.connect(transport);
  return client;
}

export async function listMcpTools(client: Client): Promise<McpToolInfo[]> {
  const result = await client.listTools();
  return result.tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? "",
    inputSchema: (tool.inputSchema ?? { type: "object", properties: {} }) as Record<string, unknown>,
  }));
}

export async function callMcpTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  return client.callTool({ name, arguments: args });
}
