import { z } from "zod";

export const redisCommandConfigSchema = z.object({
  credential: z.string().min(1, "Selecione a conexao (credential) do Redis."),
  command: z.string().min(1, "Informe o comando, ex: GET, SET, LPUSH."),
  args: z.array(z.union([z.string(), z.number()])).default([]),
});
export type RedisCommandConfig = z.infer<typeof redisCommandConfigSchema>;

export const redisCommandMeta = {
  type: "database.redis",
  category: "database",
  label: "Redis",
  description: "Executa um comando Redis numa conexao do workspace.",
  icon: "Database",
  outputs: ["default"],
  configSchema: redisCommandConfigSchema,
  defaultConfig: { credential: "", command: "GET", args: [] } as RedisCommandConfig,
} as const;
