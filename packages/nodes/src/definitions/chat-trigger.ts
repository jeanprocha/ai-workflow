import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const configSchema = z.object({
  chatToken: z.string().describe("Gerado automaticamente ao salvar o fluxo."),
  inboxToken: z.string().describe("Gerado automaticamente ao salvar o fluxo."),
  welcomeMessage: z.string().default(""),
  /** Mostrada ao visitante quando a execucao falha, pra ele nunca ficar sem resposta. */
  errorMessage: z.string().default(""),
});
type Config = z.infer<typeof configSchema>;

export const chatTriggerNode: NodeDefinition<Config> = {
  type: "trigger.chat",
  category: "trigger",
  label: "Chat",
  description:
    "Inicia o fluxo quando o visitante manda uma mensagem no chat publico da plataforma (/chat/:chatToken).",
  icon: "MessagesSquare",
  outputs: ["default"],
  configSchema,
  defaultConfig: { chatToken: "", inboxToken: "", welcomeMessage: "", errorMessage: "" },
  execute: (ctx) => ({ output: ctx.input }),
};
