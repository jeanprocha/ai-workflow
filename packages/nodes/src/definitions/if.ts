import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const OPERATORS = ["==", "!=", ">", "<", ">=", "<=", "contains"] as const;

const configSchema = z.object({
  left: z.unknown(),
  operator: z.enum(OPERATORS).default("=="),
  right: z.unknown(),
});
type Config = z.infer<typeof configSchema>;

function toComparable(value: unknown): number | string {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

function evaluate(left: unknown, operator: (typeof OPERATORS)[number], right: unknown): boolean {
  if (operator === "contains") {
    if (Array.isArray(left)) return left.includes(right);
    return String(left ?? "").includes(String(right ?? ""));
  }

  const a = toComparable(left);
  const b = toComparable(right);

  switch (operator) {
    case "==":
      return a === b;
    case "!=":
      return a !== b;
    case ">":
      return a > b;
    case "<":
      return a < b;
    case ">=":
      return a >= b;
    case "<=":
      return a <= b;
  }
}

export const ifNode: NodeDefinition<Config> = {
  type: "logic.if",
  category: "logic",
  label: "If",
  description: "Decide entre dois caminhos (true/false) com base numa condicao.",
  icon: "GitBranch",
  outputs: ["true", "false"],
  configSchema,
  defaultConfig: { left: "", operator: "==", right: "" },
  execute: (ctx) => {
    const result = evaluate(ctx.config.left, ctx.config.operator, ctx.config.right);
    ctx.log("if.evaluated", { left: ctx.config.left, operator: ctx.config.operator, right: ctx.config.right, result });
    return { output: { result }, branch: result ? "true" : "false" };
  },
};
