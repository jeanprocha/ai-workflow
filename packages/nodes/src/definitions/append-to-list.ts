import { z } from "zod";
import type { NodeDefinition } from "../types.js";

const configSchema = z.object({
  /**
   * Expressao pra lista atual — tipicamente `{{ $vars.carrinho }}`.
   * Ausente/vazia na primeira vez (carrinho ainda nao existe): tratado como
   * lista vazia, nao como erro. `.optional()`: sem isso, um `z.unknown()`
   * sozinho rejeita undefined direto no parse do worker (zod v4), antes do
   * execute() decidir o que fazer.
   */
  source: z.unknown().optional(),
  /** Expressao pro item novo a acrescentar — normalmente um objeto montado com `$vars`/`$node`. */
  item: z.unknown(),
});
type Config = z.infer<typeof configSchema>;

export const appendToListNode: NodeDefinition<Config> = {
  type: "logic.appendToList",
  category: "logic",
  label: "Adicionar à lista",
  description:
    "Acrescenta um item ao final de uma lista existente — util pra montar um carrinho ao longo de varias mensagens de uma conversa, ja que expressoes nao tem como alterar um array salvo em $vars diretamente.",
  icon: "ListPlus",
  outputs: ["default"],
  configSchema,
  defaultConfig: { source: "", item: {} },
  execute: (ctx) => {
    const { source, item } = ctx.config;
    // Primeira chamada (carrinho ainda nao existe em $vars): source resolve
    // pra undefined, nao pra um array — comeca de lista vazia em vez de
    // falhar, ao contrario do Transformar lista (la, source errado e sempre
    // engano; aqui, "ainda nao existe" e o caso normal e esperado).
    const list = Array.isArray(source) ? source : [];
    const items = [...list, item];
    return { output: { items, total: items.length } };
  },
};
