import { z } from "zod";

export const mysqlQueryConfigSchema = z.object({
  credential: z.string().min(1, "Selecione a conexao (credential) do MySQL."),
  query: z.string().min(1, "Informe a query SQL."),
  params: z.array(z.unknown()).default([]),
});
export type MysqlQueryConfig = z.infer<typeof mysqlQueryConfigSchema>;

export const mysqlQueryMeta = {
  type: "database.mysql",
  category: "database",
  label: "MySQL",
  description: "Executa uma query SQL numa conexao MySQL do workspace.",
  icon: "Database",
  outputs: ["default"],
  configSchema: mysqlQueryConfigSchema,
  defaultConfig: { credential: "", query: "", params: [] } as MysqlQueryConfig,
} as const;
