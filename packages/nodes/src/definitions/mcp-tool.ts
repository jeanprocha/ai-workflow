import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const configSchema = z.object({
  mcpServerId: z.string().min(1, "Selecione um servidor MCP."),
  toolName: z.string().min(1, "Selecione uma tool."),
  args: z.record(z.string(), z.unknown()).default({}),
});
type Config = z.infer<typeof configSchema>;

export const mcpToolNode: NodeDefinition<Config> = {
  type: "mcp.tool",
  category: "ai",
  label: "MCP Tool",
  description: "Invoca uma tool de um servidor MCP conectado do workspace.",
  icon: "Plug",
  outputs: ["default"],
  configSchema,
  defaultConfig: { mcpServerId: "", toolName: "", args: {} },
  execute: async (ctx) => {
    const result = await ctx.callMcpTool(ctx.config.mcpServerId, ctx.config.toolName, ctx.config.args);
    ctx.log("mcp.tool", { toolName: ctx.config.toolName });
    return { output: result };
  },
};
