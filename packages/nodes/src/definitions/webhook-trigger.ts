import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const configSchema = z.object({
  webhookId: z.string().describe("Gerado automaticamente ao criar o node."),
});
type Config = z.infer<typeof configSchema>;

export const webhookTriggerNode: NodeDefinition<Config> = {
  type: "trigger.webhook",
  category: "trigger",
  label: "Webhook",
  description: "Inicia o fluxo quando uma requisicao POST chega em /hooks/:webhookId.",
  icon: "Webhook",
  outputs: ["default"],
  configSchema,
  defaultConfig: { webhookId: "" },
  execute: (ctx) => ({ output: ctx.input }),
};
