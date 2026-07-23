import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const configSchema = z.object({
  credential: z.string().min(1, "Selecione a conexao (bot token) do Telegram."),
  chatId: z.string().min(1, "Informe o chat ID."),
  message: z.string().min(1, "Informe a mensagem."),
});
type Config = z.infer<typeof configSchema>;

export const telegramMessageNode: NodeDefinition<Config> = {
  type: "communication.telegram",
  category: "communication",
  label: "Telegram",
  description: "Envia uma mensagem via Telegram Bot API.",
  icon: "Send",
  outputs: ["default"],
  configSchema,
  defaultConfig: { credential: "", chatId: "", message: "" },
  execute: async (ctx) => {
    const token = await ctx.getCredential(ctx.config.credential);
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: ctx.config.chatId, text: ctx.config.message }),
    });
    const body = (await response.json()) as { ok: boolean; result?: { message_id?: number } };
    if (!response.ok || !body.ok) {
      throw new Error(`Telegram retornou erro: ${JSON.stringify(body)}`);
    }
    ctx.log("telegram.sent", { messageId: body.result?.message_id });
    return { output: { messageId: body.result?.message_id } };
  },
};
