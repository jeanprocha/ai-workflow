import { z } from "zod";

export const pdfParseConfigSchema = z.object({
  url: z.string().min(1, "Informe a URL do PDF."),
});
export type PdfParseConfig = z.infer<typeof pdfParseConfigSchema>;

export const pdfParseMeta = {
  type: "file.pdf",
  category: "file",
  label: "PDF",
  description: "Extrai o texto de um arquivo PDF a partir de uma URL.",
  icon: "FileText",
  outputs: ["default"],
  configSchema: pdfParseConfigSchema,
  defaultConfig: { url: "" } as PdfParseConfig,
} as const;
