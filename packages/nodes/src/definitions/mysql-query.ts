import mysql from "mysql2/promise";
import type { NodeDefinition } from "../types.js";
import { mysqlQueryMeta, type MysqlQueryConfig } from "./mysql-query.meta.js";

export const mysqlQueryNode: NodeDefinition<MysqlQueryConfig> = {
  ...mysqlQueryMeta,
  execute: async (ctx) => {
    const uri = await ctx.getCredential(ctx.config.credential);
    const connection = await mysql.createConnection(uri);
    try {
      const [rows] = await connection.query(ctx.config.query, ctx.config.params);
      const rowCount = Array.isArray(rows) ? rows.length : 0;
      ctx.log("mysql.query", { rowCount });
      return { output: { rows, rowCount } };
    } finally {
      await connection.end();
    }
  },
};
