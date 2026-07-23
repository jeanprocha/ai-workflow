import { z } from "zod";
import { parse } from "csv-parse/sync";
import type { NodeDefinition } from "../types.js";

const configSchema = z.object({
  source: z.enum(["input", "url"]).default("input"),
  url: z.string().optional(),
  delimiter: z.string().default(","),
});
type Config = z.infer<typeof configSchema>;

export const csvParseNode: NodeDefinition<Config> = {
  type: "file.csv",
  category: "file",
  label: "CSV",
  description: "Converte um CSV (do input ou de uma URL) em uma lista de objetos.",
  icon: "FileSpreadsheet",
  outputs: ["default"],
  configSchema,
  defaultConfig: { source: "input", delimiter: "," },
  execute: async (ctx) => {
    let text: string;
    if (ctx.config.source === "url") {
      if (!ctx.config.url) throw new Error("Informe a URL do CSV.");
      const response = await fetch(ctx.config.url);
      if (!response.ok) throw new Error(`Falha ao baixar o CSV (status ${response.status}).`);
      text = await response.text();
    } else {
      text = typeof ctx.input === "string" ? ctx.input : JSON.stringify(ctx.input);
    }

    const rows = parse(text, {
      columns: true,
      skip_empty_lines: true,
      delimiter: ctx.config.delimiter,
      trim: true,
    }) as Record<string, string>[];

    ctx.log("csv.parsed", { rowCount: rows.length });
    return { output: { rows } };
  },
};
