import { PDFParse } from "pdf-parse";
import type { NodeDefinition } from "../types.js";
import { pdfParseMeta, type PdfParseConfig } from "./pdf-parse.meta.js";

export const pdfParseNode: NodeDefinition<PdfParseConfig> = {
  ...pdfParseMeta,
  execute: async (ctx) => {
    const response = await fetch(ctx.config.url);
    if (!response.ok) {
      throw new Error(`Falha ao baixar o PDF (status ${response.status}).`);
    }
    const buffer = new Uint8Array(await response.arrayBuffer());

    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      ctx.log("pdf.parsed", { pages: result.pages.length });
      return { output: { text: result.text, pages: result.pages.length } };
    } finally {
      await parser.destroy();
    }
  },
};
