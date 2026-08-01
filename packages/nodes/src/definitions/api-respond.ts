import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const configSchema = z.object({});
type Config = z.infer<typeof configSchema>;

export const apiRespondNode: NodeDefinition<Config> = {
  type: "api.respond",
  category: "api",
  label: "Responder da API",
  description:
    "Marca o resultado deste ponto do fluxo como a resposta do endpoint publicado (POST /v1/flows/:id/invoke). Passthrough: o dado continua seguindo pro proximo node. Sem este node, a resposta e o output do ultimo node executado — que com caminhos paralelos nao e deterministico.",
  icon: "Reply",
  outputs: ["default"],
  configSchema,
  defaultConfig: {},
  execute: (ctx) => ({ output: ctx.input }),
};
