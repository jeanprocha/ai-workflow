import { Client } from "pg";
import type { NodeDefinition } from "../types.js";
import { postgresQueryMeta, type PostgresQueryConfig } from "./postgres-query.meta.js";

export const postgresQueryNode: NodeDefinition<PostgresQueryConfig> = {
  ...postgresQueryMeta,
  execute: async (ctx) => {
    const connectionString = await ctx.getCredential(ctx.config.credential);
    const client = new Client({ connectionString });
    await client.connect();
    try {
      const result = await client.query(ctx.config.query, ctx.config.params);
      ctx.log("postgres.query", { rowCount: result.rowCount });
      return { output: { rows: result.rows, rowCount: result.rowCount } };
    } finally {
      await client.end();
    }
  },
};
