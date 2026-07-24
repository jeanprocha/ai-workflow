import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const configSchema = z.object({
  credential: z.string().min(1, "Selecione a conexao (Personal Access Token) do GitHub."),
  owner: z.string().min(1, "Informe o dono do repositorio (usuario ou organizacao)."),
  repo: z.string().min(1, "Informe o nome do repositorio."),
  title: z.string().min(1, "Informe o titulo da issue."),
  body: z.string().default(""),
});
type Config = z.infer<typeof configSchema>;

export const githubCreateIssueNode: NodeDefinition<Config> = {
  type: "integration.github",
  category: "api",
  label: "GitHub",
  description: "Cria uma issue num repositorio do GitHub.",
  icon: "Github",
  outputs: ["default"],
  configSchema,
  defaultConfig: { credential: "", owner: "", repo: "", title: "", body: "" },
  execute: async (ctx) => {
    const token = await ctx.getCredential(ctx.config.credential);
    const response = await fetch(
      `https://api.github.com/repos/${ctx.config.owner}/${ctx.config.repo}/issues`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: ctx.config.title, body: ctx.config.body }),
      },
    );
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        `GitHub retornou status ${response.status}: ${JSON.stringify(body)}`,
      );
    }
    ctx.log("github.issue.created", { status: response.status });
    return { output: body };
  },
};
