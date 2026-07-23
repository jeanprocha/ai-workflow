import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const configSchema = z.object({
  source: z.enum(["input", "url"]).default("input"),
  url: z.string().optional(),
});
type Config = z.infer<typeof configSchema>;

export const jsonParseNode: NodeDefinition<Config> = {
  type: "file.json",
  category: "file",
  label: "JSON",
  description: "Le e faz o parse de um JSON (do input ou de uma URL).",
  icon: "Braces",
  outputs: ["default"],
  configSchema,
  defaultConfig: { source: "input" },
  execute: async (ctx) => {
    let raw: unknown;
    if (ctx.config.source === "url") {
      if (!ctx.config.url) throw new Error("Informe a URL do JSON.");
      const response = await fetch(ctx.config.url);
      if (!response.ok) throw new Error(`Falha ao baixar o JSON (status ${response.status}).`);
      raw = await response.json();
    } else {
      raw = typeof ctx.input === "string" ? JSON.parse(ctx.input) : ctx.input;
    }
    return { output: raw };
  },
};
