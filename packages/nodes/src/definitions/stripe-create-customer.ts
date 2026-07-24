import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const configSchema = z.object({
  credential: z.string().min(1, "Selecione a conexao (secret key) do Stripe."),
  email: z.string().min(1, "Informe o email do cliente."),
  name: z.string().default(""),
});
type Config = z.infer<typeof configSchema>;

export const stripeCreateCustomerNode: NodeDefinition<Config> = {
  type: "integration.stripe",
  category: "api",
  label: "Stripe",
  description: "Cria um cliente no Stripe.",
  icon: "CreditCard",
  outputs: ["default"],
  configSchema,
  defaultConfig: { credential: "", email: "", name: "" },
  execute: async (ctx) => {
    const secretKey = await ctx.getCredential(ctx.config.credential);
    const params = new URLSearchParams({ email: ctx.config.email });
    if (ctx.config.name) params.set("name", ctx.config.name);

    const response = await fetch("https://api.stripe.com/v1/customers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`Stripe retornou status ${response.status}: ${JSON.stringify(body)}`);
    }
    ctx.log("stripe.customer.created", { status: response.status });
    return { output: body };
  },
};
