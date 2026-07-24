import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const CREATE_ISSUE_MUTATION = `
  mutation IssueCreate($teamId: String!, $title: String!, $description: String) {
    issueCreate(input: { teamId: $teamId, title: $title, description: $description }) {
      success
      issue { id identifier title url }
    }
  }
`;

const configSchema = z.object({
  credential: z.string().min(1, "Selecione a conexao (API key) do Linear."),
  teamId: z.string().min(1, "Informe o ID do time."),
  title: z.string().min(1, "Informe o titulo da issue."),
  description: z.string().default(""),
});
type Config = z.infer<typeof configSchema>;

export const linearCreateIssueNode: NodeDefinition<Config> = {
  type: "integration.linear",
  category: "api",
  label: "Linear",
  description: "Cria uma issue num time do Linear.",
  icon: "CircleDot",
  outputs: ["default"],
  configSchema,
  defaultConfig: { credential: "", teamId: "", title: "", description: "" },
  execute: async (ctx) => {
    const apiKey = await ctx.getCredential(ctx.config.credential);
    const response = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: CREATE_ISSUE_MUTATION,
        variables: {
          teamId: ctx.config.teamId,
          title: ctx.config.title,
          description: ctx.config.description || undefined,
        },
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      errors?: unknown;
      data?: { issueCreate?: { success: boolean; issue: unknown } };
    } | null;
    if (!response.ok || body?.errors || !body?.data?.issueCreate?.success) {
      throw new Error(`Linear retornou erro: ${JSON.stringify(body)}`);
    }
    ctx.log("linear.issue.created", { status: response.status });
    return { output: body.data.issueCreate.issue };
  },
};
