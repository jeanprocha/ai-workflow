import { z } from "zod";

export const postgresQueryConfigSchema = z.object({
  credential: z.string().min(1, "Selecione a conexao (credential) do Postgres."),
  query: z.string().min(1, "Informe a query SQL."),
  params: z.array(z.unknown()).default([]),
});
export type PostgresQueryConfig = z.infer<typeof postgresQueryConfigSchema>;

export const postgresQueryMeta = {
  type: "database.postgres",
  category: "database",
  label: "PostgreSQL",
  description: "Executa uma query SQL numa conexao Postgres do workspace.",
  icon: "Database",
  outputs: ["default"],
  configSchema: postgresQueryConfigSchema,
  defaultConfig: { credential: "", query: "", params: [] } as PostgresQueryConfig,
} as const;
