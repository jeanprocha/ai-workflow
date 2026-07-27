import { z } from "zod";
import type { NodeDefinition } from "../types.js";
import { getPath } from "../expressions.js";

const fieldSchema = z.object({
  /** Nome da chave no item de saida. */
  as: z.string().min(1),
  /** Caminho no item de origem — aceita indice de array (`ProdutoGrade.0.Sku`), ver getPath. */
  path: z.string().min(1),
});

const configSchema = z.object({
  /** Expressao que resolve numa lista — ja chega resolvida aqui (ver engine.service.ts). */
  source: z.unknown(),
  /** 0 = sem limite, devolve a lista inteira (so reduz campos, se `fields` tiver algo). */
  limit: z.number().int().min(0).default(0),
  /** Vazio mantem o item inteiro — so limita a quantidade. */
  fields: z.array(fieldSchema).default([]),
});
type Config = z.infer<typeof configSchema>;

export const transformListNode: NodeDefinition<Config> = {
  type: "logic.transformList",
  category: "logic",
  label: "Transformar lista",
  description:
    "Limita quantos itens de uma lista seguem adiante e/ou reduz cada item a so os campos escolhidos — util pra nao mandar o JSON inteiro de uma resposta de API pra um agente de IA.",
  icon: "ListFilter",
  outputs: ["default"],
  configSchema,
  defaultConfig: { source: "", limit: 0, fields: [] },
  execute: (ctx) => {
    const { source, limit, fields } = ctx.config;

    if (!Array.isArray(source)) {
      // O engano mais provavel aqui e apontar a Origem pro node/campo errado
      // (ex.: `{{ $node.<id>.body.data }}` quando os itens estao em
      // `body.data.items`) — sem este erro, o node seguinte receberia
      // `items: []` em silencio.
      throw new Error(
        'Campo "Origem" nao resolveu pra uma lista — confira se a expressao aponta pro array certo (ex.: "{{ $node.<id>.body.data.items }}").',
      );
    }

    const total = source.length;
    const sliced = limit > 0 ? source.slice(0, limit) : source;
    const items =
      fields.length === 0
        ? sliced
        : sliced.map((item) =>
            Object.fromEntries(fields.map((field) => [field.as, getPath(item, field.path)])),
          );

    return { output: { items, total, shown: items.length } };
  },
};
