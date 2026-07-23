import { z } from "zod";

export const docxParseConfigSchema = z.object({
  url: z.string().min(1, "Informe a URL do DOCX."),
});
export type DocxParseConfig = z.infer<typeof docxParseConfigSchema>;

export const docxParseMeta = {
  type: "file.docx",
  category: "file",
  label: "DOCX",
  description: "Extrai o texto de um arquivo Word (.docx) a partir de uma URL.",
  icon: "FileText",
  outputs: ["default"],
  configSchema: docxParseConfigSchema,
  defaultConfig: { url: "" } as DocxParseConfig,
} as const;
