import { MongoClient } from "mongodb";
import type { NodeDefinition } from "../types.js";
import { mongodbQueryMeta, type MongodbQueryConfig } from "./mongodb-query.meta.js";

export const mongodbQueryNode: NodeDefinition<MongodbQueryConfig> = {
  ...mongodbQueryMeta,
  execute: async (ctx) => {
    const uri = await ctx.getCredential(ctx.config.credential);
    const client = new MongoClient(uri);
    await client.connect();
    try {
      const db = client.db();
      const collection = db.collection(ctx.config.collection);
      const { operation, filter } = ctx.config;

      let output: unknown;
      if (operation === "find") {
        output = { documents: await collection.find(filter).limit(200).toArray() };
      } else if (operation === "insertOne") {
        output = await collection.insertOne(ctx.config.document ?? {});
      } else if (operation === "updateOne") {
        output = await collection.updateOne(filter, ctx.config.update ?? {});
      } else {
        output = await collection.deleteOne(filter);
      }

      ctx.log("mongodb.query", { collection: ctx.config.collection, operation });
      return { output };
    } finally {
      await client.close();
    }
  },
};
