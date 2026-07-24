import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const configSchema = z.object({
  cronExpression: z.string().default("0 9 * * *"),
  timezone: z.string().default("America/Sao_Paulo"),
  enabled: z.boolean().default(true),
});
type Config = z.infer<typeof configSchema>;

export const cronTriggerNode: NodeDefinition<Config> = {
  type: "trigger.cron",
  category: "trigger",
  label: "Schedule",
  description: "Inicia o fluxo periodicamente, seguindo uma expressao cron.",
  icon: "Clock",
  outputs: ["default"],
  configSchema,
  defaultConfig: {
    cronExpression: "0 9 * * *",
    timezone: "America/Sao_Paulo",
    enabled: true,
  },
  execute: (ctx) => ({ output: ctx.input }),
};
