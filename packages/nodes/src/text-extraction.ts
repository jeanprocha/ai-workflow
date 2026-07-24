import { PDFParse } from "pdf-parse";
import * as mammoth from "mammoth";
import { parse } from "csv-parse/sync";

export type DocumentSourceType = "pdf" | "docx" | "txt" | "md" | "csv";

export function inferSourceType(filename: string, mimetype: string): DocumentSourceType {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "pdf" || mimetype === "application/pdf") return "pdf";
  if (ext === "docx" || mimetype.includes("wordprocessingml")) return "docx";
  if (ext === "csv" || mimetype === "text/csv") return "csv";
  if (ext === "md" || ext === "markdown") return "md";
  return "txt";
}

/** Extrai texto puro de um arquivo enviado, reaproveitando as mesmas libs dos nodes file.* (Fase 4). */
export async function extractText(buffer: Buffer, sourceType: DocumentSourceType): Promise<string> {
  switch (sourceType) {
    case "pdf": {
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        const result = await parser.getText();
        return result.text;
      } finally {
        await parser.destroy();
      }
    }
    case "docx": {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    case "csv": {
      const rows = parse(buffer.toString("utf-8"), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as Record<string, string>[];
      return rows
        .map((row) => Object.entries(row).map(([key, value]) => `${key}: ${value}`).join(", "))
        .join("\n");
    }
    case "txt":
    case "md":
      return buffer.toString("utf-8");
  }
}
