import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const configSchema = z.object({
  url: z.string().min(1, "Informe a URL do endpoint GraphQL."),
  query: z.string().min(1, "Informe a query/mutation."),
  variables: z.record(z.string(), z.unknown()).default({}),
  headers: z.record(z.string(), z.string()).default({}),
});
type Config = z.infer<typeof configSchema>;

export const graphqlRequestNode: NodeDefinition<Config> = {
  type: "api.graphql",
  category: "api",
  label: "GraphQL",
  description: "Executa uma query ou mutation GraphQL.",
  icon: "Braces",
  outputs: ["default"],
  configSchema,
  defaultConfig: { url: "", query: "", variables: {}, headers: {} },
  execute: async (ctx) => {
    const response = await fetch(ctx.config.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.config.headers },
      body: JSON.stringify({ query: ctx.config.query, variables: ctx.config.variables }),
    });
    const body = (await response.json()) as { data?: unknown; errors?: unknown };
    ctx.log("graphql.response", { status: response.status, hasErrors: !!body.errors });

    if (body.errors) {
      throw new Error(`GraphQL retornou erros: ${JSON.stringify(body.errors)}`);
    }

    return { output: body.data };
  },
};
