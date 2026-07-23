import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const configSchema = z.object({});
type Config = z.infer<typeof configSchema>;

export const manualTriggerNode: NodeDefinition<Config> = {
  type: "trigger.manual",
  category: "trigger",
  label: "Manual Trigger",
  description: "Inicia o fluxo manualmente, com um payload informado na hora de executar.",
  icon: "Play",
  outputs: ["default"],
  configSchema,
  defaultConfig: {},
  execute: (ctx) => ({ output: ctx.input }),
};
