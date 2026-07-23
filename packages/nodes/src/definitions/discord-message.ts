import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const configSchema = z.object({
  credential: z.string().min(1, "Selecione a conexao (webhook URL) do Discord."),
  message: z.string().min(1, "Informe a mensagem."),
});
type Config = z.infer<typeof configSchema>;

export const discordMessageNode: NodeDefinition<Config> = {
  type: "communication.discord",
  category: "communication",
  label: "Discord",
  description: "Envia uma mensagem para um canal via Webhook do Discord.",
  icon: "MessageSquare",
  outputs: ["default"],
  configSchema,
  defaultConfig: { credential: "", message: "" },
  execute: async (ctx) => {
    const webhookUrl = await ctx.getCredential(ctx.config.credential);
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: ctx.config.message }),
    });
    if (!response.ok) {
      throw new Error(`Discord retornou status ${response.status}.`);
    }
    ctx.log("discord.sent", { status: response.status });
    return { output: { status: response.status } };
  },
};
