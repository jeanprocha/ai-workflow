import { Redis } from "ioredis";
import type { NodeDefinition } from "../types.js";
import { redisCommandMeta, type RedisCommandConfig } from "./redis-command.meta.js";

export const redisCommandNode: NodeDefinition<RedisCommandConfig> = {
  ...redisCommandMeta,
  execute: async (ctx) => {
    const url = await ctx.getCredential(ctx.config.credential);
    const client = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
    try {
      await client.connect();
      const result = await client.call(ctx.config.command, ...ctx.config.args);
      ctx.log("redis.command", { command: ctx.config.command });
      return { output: { result } };
    } finally {
      client.disconnect();
    }
  },
};
