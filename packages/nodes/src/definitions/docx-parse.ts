import * as mammoth from "mammoth";
import type { NodeDefinition } from "../types.js";
import { docxParseMeta, type DocxParseConfig } from "./docx-parse.meta.js";

export const docxParseNode: NodeDefinition<DocxParseConfig> = {
  ...docxParseMeta,
  execute: async (ctx) => {
    const response = await fetch(ctx.config.url);
    if (!response.ok) {
      throw new Error(`Falha ao baixar o DOCX (status ${response.status}).`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const result = await mammoth.extractRawText({ buffer });
    ctx.log("docx.parsed", { warnings: result.messages.length });
    return { output: { text: result.value } };
  },
};
