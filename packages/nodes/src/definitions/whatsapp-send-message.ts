import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const configSchema = z.object({
  credential: z.string().min(1, "Selecione a conexao (access token) do WhatsApp Cloud API."),
  phoneNumberId: z.string().min(1, "Informe o Phone Number ID."),
  to: z.string().min(1, "Informe o numero de destino (formato internacional, sem simbolos)."),
  message: z.string().min(1, "Informe a mensagem."),
});
type Config = z.infer<typeof configSchema>;

export const whatsappSendMessageNode: NodeDefinition<Config> = {
  type: "integration.whatsapp",
  category: "communication",
  label: "WhatsApp",
  description: "Envia uma mensagem de texto via WhatsApp Cloud API (Meta).",
  icon: "MessageCircle",
  outputs: ["default"],
  configSchema,
  defaultConfig: { credential: "", phoneNumberId: "", to: "", message: "" },
  execute: async (ctx) => {
    const token = await ctx.getCredential(ctx.config.credential);
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${ctx.config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: ctx.config.to,
          type: "text",
          text: { body: ctx.config.message },
        }),
      },
    );
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`WhatsApp retornou status ${response.status}: ${JSON.stringify(body)}`);
    }
    ctx.log("whatsapp.message.sent", { status: response.status });
    return { output: body };
  },
};
