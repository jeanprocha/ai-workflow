import { z } from "zod";
import { APPROVAL_NODE_TYPE } from "@workflow/shared";

export const approvalHumanConfigSchema = z.object({
  title: z.string().min(1, "Informe o titulo da aprovacao."),
  credential: z.string().min(1, "Selecione a conexao SMTP."),
  recipients: z.string().min(1, "Informe ao menos um destinatario."),
  message: z.string().default(""),
  timeoutHours: z.number().int().min(1).max(720).default(24),
  onTimeout: z.enum(["approve", "reject"]).default("reject"),
});
export type ApprovalHumanConfig = z.infer<typeof approvalHumanConfigSchema>;

export const approvalHumanMeta = {
  type: APPROVAL_NODE_TYPE,
  category: "logic",
  label: "Aprovacao humana",
  description:
    "Pausa o fluxo e espera uma decisao humana (aprovar/rejeitar) por e-mail ou pela fila de aprovacoes.",
  icon: "UserCheck",
  outputs: ["approved", "rejected"],
  configSchema: approvalHumanConfigSchema,
  defaultConfig: {
    title: "",
    credential: "",
    recipients: "",
    message: "",
    timeoutHours: 24,
    onTimeout: "reject",
  } as ApprovalHumanConfig,
} as const;
