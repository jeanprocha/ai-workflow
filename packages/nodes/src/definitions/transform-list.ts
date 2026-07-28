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
  /**
   * Expressao que resolve numa lista — ja chega resolvida aqui (ver
   * engine.service.ts). `.optional()`: um `z.unknown()` sozinho, sem isso,
   * rejeita a chave ausente/undefined direto no parse do worker (zod v4) —
   * ANTES do execute() rodar, o que trocaria a mensagem custom abaixo
   * ("Campo Origem nao resolveu...") pelo erro generico de validacao.
   */
  source: z.unknown().optional(),
  /** A partir de qual item comecar — permite paginar (ex.: "ver mais" depois dos 5 primeiros). */
  offset: z.number().int().min(0).default(0),
  /** 0 = sem limite, devolve ate o fim da lista a partir do offset (so reduz campos, se `fields` tiver algo). */
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
  defaultConfig: { source: "", offset: 0, limit: 0, fields: [] },
  execute: (ctx) => {
    const { source, offset, limit, fields } = ctx.config;

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
    const sliced = source.slice(offset, limit > 0 ? offset + limit : undefined);
    const items =
      fields.length === 0
        ? sliced
        : sliced.map((item) =>
            Object.fromEntries(fields.map((field) => [field.as, getPath(item, field.path)])),
          );
    // Deixa o node seguinte (ai.chat formatando a resposta, ou um logic.if)
    // saber se ainda sobra item depois deste lote, sem ter que recalcular
    // offset+shown vs total na mao em toda parte que precisa disso — o caso
    // real que motivou isso foi paginar resultados de busca ("ver mais").
    const hasMore = offset + items.length < total;

    return { output: { items, total, shown: items.length, hasMore } };
  },
};
