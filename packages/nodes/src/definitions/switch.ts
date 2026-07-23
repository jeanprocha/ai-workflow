import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const configSchema = z.object({
  value: z.unknown(),
  cases: z.array(z.unknown()).max(4).default([]),
});
type Config = z.infer<typeof configSchema>;

function normalize(value: unknown): string {
  if (typeof value === "number") return String(value);
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return String(Number(value));
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

export const switchNode: NodeDefinition<Config> = {
  type: "logic.switch",
  category: "logic",
  label: "Switch",
  description: "Direciona o fluxo para um de ate 4 caminhos, com fallback default.",
  icon: "Split",
  outputs: ["0", "1", "2", "3", "default"],
  configSchema,
  defaultConfig: { value: "", cases: [] },
  execute: (ctx) => {
    const target = normalize(ctx.config.value);
    const index = ctx.config.cases.findIndex((candidate) => normalize(candidate) === target);
    const branch = index === -1 ? "default" : String(index);
    ctx.log("switch.evaluated", { value: ctx.config.value, branch });
    return { output: ctx.input, branches: [branch] };
  },
};
