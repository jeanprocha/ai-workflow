import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const configSchema = z.object({
  source: z.enum(["input", "url"]).default("input"),
  url: z.string().optional(),
});
type Config = z.infer<typeof configSchema>;

export const txtReadNode: NodeDefinition<Config> = {
  type: "file.txt",
  category: "file",
  label: "TXT",
  description: "Le um arquivo de texto puro (do input ou de uma URL).",
  icon: "FileText",
  outputs: ["default"],
  configSchema,
  defaultConfig: { source: "input" },
  execute: async (ctx) => {
    let text: string;
    if (ctx.config.source === "url") {
      if (!ctx.config.url) throw new Error("Informe a URL do arquivo.");
      const response = await fetch(ctx.config.url);
      if (!response.ok) throw new Error(`Falha ao baixar o arquivo (status ${response.status}).`);
      text = await response.text();
    } else {
      text = typeof ctx.input === "string" ? ctx.input : JSON.stringify(ctx.input);
    }
    return { output: { text } };
  },
};
