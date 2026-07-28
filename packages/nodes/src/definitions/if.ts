import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const OPERATORS = ["==", "!=", ">", "<", ">=", "<=", "contains", "matches"] as const;

const configSchema = z.object({
  // `.optional()`: um config salvo sem essa chave (grafo antigo, preset
  // parcial) faria o zod v4 rejeitar a chave ausente direto no parse do
  // worker, mesmo sendo z.unknown() — antes do execute() decidir o que
  // fazer com undefined (que aqui e um valor de comparacao legitimo).
  left: z.unknown().optional(),
  operator: z.enum(OPERATORS).default("=="),
  right: z.unknown().optional(),
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

  if (operator === "matches") {
    // Ex.: detectar se a mensagem do cliente e um codigo de produto puro
    // (`^\d+$`) antes de decidir entre busca por codigo ou por nome, sem
    // precisar de uma chamada de IA so pra essa checagem deterministica.
    const pattern = String(right ?? "");
    let regex: RegExp;
    try {
      regex = new RegExp(pattern);
    } catch {
      throw new Error(`Padrao de regex invalido no campo "Valor direito": "${pattern}".`);
    }
    return regex.test(String(left ?? ""));
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
    return { output: { result }, branches: [result ? "true" : "false"] };
  },
};
