import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const configSchema = z.object({
  message: z.string().min(1, "Informe a mensagem."),
});
type Config = z.infer<typeof configSchema>;

export const chatReplyNode: NodeDefinition<Config> = {
  type: "chat.reply",
  category: "communication",
  label: "Responder no chat",
  description:
    "Envia uma mensagem ao visitante da conversa (so funciona em fluxos disparados pelo trigger Chat). Pode aparecer varias vezes no mesmo fluxo.",
  icon: "MessageSquare",
  outputs: ["default"],
  configSchema,
  defaultConfig: { message: "" },
  execute: async (ctx) => {
    await ctx.sendChatMessage(ctx.config.message);
    // Passthrough: deixa o input original seguir pro proximo node, pra um
    // fluxo poder responder no meio do caminho sem perder o dado em transito.
    return { output: ctx.input };
  },
};
