import { z } from "zod";

export const emailSendConfigSchema = z.object({
  credential: z.string().min(1, "Selecione a conexao SMTP."),
  to: z.string().min(1, "Informe o destinatario."),
  subject: z.string().min(1, "Informe o assunto."),
  body: z.string().default(""),
});
export type EmailSendConfig = z.infer<typeof emailSendConfigSchema>;

export interface SmtpCredential {
  host: string;
  port: number;
  secure?: boolean;
  user: string;
  pass: string;
  from?: string;
}

export const emailSendMeta = {
  type: "communication.email",
  category: "communication",
  label: "Email",
  description: "Envia um email via SMTP usando uma conexao do workspace.",
  icon: "Mail",
  outputs: ["default"],
  configSchema: emailSendConfigSchema,
  defaultConfig: { credential: "", to: "", subject: "", body: "" } as EmailSendConfig,
} as const;
