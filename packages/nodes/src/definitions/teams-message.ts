import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const configSchema = z.object({
  credential: z.string().min(1, "Selecione a conexao (webhook URL) do Teams."),
  message: z.string().min(1, "Informe a mensagem."),
});
type Config = z.infer<typeof configSchema>;

export const teamsMessageNode: NodeDefinition<Config> = {
  type: "integration.teams",
  category: "communication",
  label: "Microsoft Teams",
  description: "Envia uma mensagem para um canal via Incoming Webhook do Teams.",
  icon: "MessagesSquare",
  outputs: ["default"],
  configSchema,
  defaultConfig: { credential: "", message: "" },
  execute: async (ctx) => {
    const webhookUrl = await ctx.getCredential(ctx.config.credential);
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        summary: "Mensagem do Workflow AI Platform",
        text: ctx.config.message,
      }),
    });
    if (!response.ok) {
      throw new Error(`Teams retornou status ${response.status}.`);
    }
    ctx.log("teams.sent", { status: response.status });
    return { output: { status: response.status } };
  },
};
