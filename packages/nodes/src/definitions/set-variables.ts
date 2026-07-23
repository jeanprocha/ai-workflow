import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const configSchema = z.object({
  assignments: z
    .array(z.object({ key: z.string().min(1), value: z.unknown() }))
    .default([]),
});
type Config = z.infer<typeof configSchema>;

export const setVariablesNode: NodeDefinition<Config> = {
  type: "logic.setVariables",
  category: "logic",
  label: "Set Variables",
  description: "Define variaveis de runtime disponiveis para o restante da execucao.",
  icon: "Variable",
  outputs: ["default"],
  configSchema,
  defaultConfig: { assignments: [] },
  execute: (ctx) => {
    const varsPatch = Object.fromEntries(
      ctx.config.assignments.map((assignment) => [assignment.key, assignment.value]),
    );
    ctx.log("vars.set", varsPatch);
    return { output: ctx.input, varsPatch };
  },
};
