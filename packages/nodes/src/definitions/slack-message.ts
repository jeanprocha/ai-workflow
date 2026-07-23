import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const configSchema = z.object({
  credential: z.string().min(1, "Selecione a conexao (webhook URL) do Slack."),
  message: z.string().min(1, "Informe a mensagem."),
});
type Config = z.infer<typeof configSchema>;

export const slackMessageNode: NodeDefinition<Config> = {
  type: "communication.slack",
  category: "communication",
  label: "Slack",
  description: "Envia uma mensagem para um canal via Incoming Webhook do Slack.",
  icon: "MessageSquare",
  outputs: ["default"],
  configSchema,
  defaultConfig: { credential: "", message: "" },
  execute: async (ctx) => {
    const webhookUrl = await ctx.getCredential(ctx.config.credential);
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: ctx.config.message }),
    });
    if (!response.ok) {
      throw new Error(`Slack retornou status ${response.status}.`);
    }
    ctx.log("slack.sent", { status: response.status });
    return { output: { status: response.status } };
  },
};
