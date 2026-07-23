import { z } from "zod";

export const mongodbQueryConfigSchema = z.object({
  credential: z.string().min(1, "Selecione a conexao (credential) do MongoDB."),
  collection: z.string().min(1, "Informe a collection."),
  operation: z.enum(["find", "insertOne", "updateOne", "deleteOne"]).default("find"),
  filter: z.record(z.string(), z.unknown()).default({}),
  update: z.record(z.string(), z.unknown()).optional(),
  document: z.record(z.string(), z.unknown()).optional(),
});
export type MongodbQueryConfig = z.infer<typeof mongodbQueryConfigSchema>;

export const mongodbQueryMeta = {
  type: "database.mongodb",
  category: "database",
  label: "MongoDB",
  description: "Executa find/insertOne/updateOne/deleteOne numa collection do MongoDB.",
  icon: "Database",
  outputs: ["default"],
  configSchema: mongodbQueryConfigSchema,
  defaultConfig: {
    collection: "",
    credential: "",
    operation: "find",
    filter: {},
  } as MongodbQueryConfig,
} as const;
