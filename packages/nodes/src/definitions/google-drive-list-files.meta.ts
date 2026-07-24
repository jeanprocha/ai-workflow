import { z } from "zod";

export const googleDriveListFilesConfigSchema = z.object({
  credential: z.string().min(1, "Selecione a conexao (JSON da Service Account) do Google Drive."),
  query: z.string().default(""),
  pageSize: z.number().int().min(1).max(100).default(10),
});
export type GoogleDriveListFilesConfig = z.infer<typeof googleDriveListFilesConfigSchema>;

export const googleDriveListFilesMeta = {
  type: "integration.googleDrive",
  category: "api",
  label: "Google Drive",
  description: "Lista arquivos do Google Drive, autenticando via Service Account.",
  icon: "HardDrive",
  outputs: ["default"],
  configSchema: googleDriveListFilesConfigSchema,
  defaultConfig: { credential: "", query: "", pageSize: 10 } as GoogleDriveListFilesConfig,
} as const;
