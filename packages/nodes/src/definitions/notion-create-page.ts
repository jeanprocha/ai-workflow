import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const NOTION_VERSION = "2022-06-28";

const configSchema = z.object({
  credential: z.string().min(1, "Selecione a conexao (integration token) do Notion."),
  databaseId: z.string().min(1, "Informe o ID do database."),
  title: z.string().min(1, "Informe o titulo da pagina."),
  titleProperty: z.string().default("Name"),
});
type Config = z.infer<typeof configSchema>;

export const notionCreatePageNode: NodeDefinition<Config> = {
  type: "integration.notion",
  category: "api",
  label: "Notion",
  description: "Cria uma pagina num database do Notion.",
  icon: "FileText",
  outputs: ["default"],
  configSchema,
  defaultConfig: { credential: "", databaseId: "", title: "", titleProperty: "Name" },
  execute: async (ctx) => {
    const token = await ctx.getCredential(ctx.config.credential);
    const response = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { database_id: ctx.config.databaseId },
        properties: {
          [ctx.config.titleProperty]: {
            title: [{ text: { content: ctx.config.title } }],
          },
        },
      }),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`Notion retornou status ${response.status}: ${JSON.stringify(body)}`);
    }
    ctx.log("notion.page.created", { status: response.status });
    return { output: body };
  },
};
