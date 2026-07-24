# ADR-009: Limites da saida estruturada (outputSchema) entre providers de IA

Status: Aceito
Data: 2026-07-24

## Contexto

A Fase 11 (Autocomplete, AI Debugger, Copilot) depende pesadamente de `ChatOptions.outputSchema`
(`packages/ai`) para forcar o LLM a responder em JSON validado — sem isso, parsear texto livre de
um LLM de forma confiavel e impraticavel. Ao implementar as 3 features, chamadas reais a Anthropic
(`claude-sonnet-5`) falharam repetidamente com `400 invalid_request_error` durante o desenvolvimento,
cada uma apontando uma constraint de JSON Schema especifica que o modo estrito da Anthropic nao aceita:

1. `additionalProperties: object` (ou qualquer valor que nao seja o booleano `false`) num `type: "object"`.
2. `minItems`/`maxItems` em `type: "array"`.
3. `minimum`/`maximum` em `type: "integer"`.

Essas 3 constraints surgem naturalmente ao converter um schema Zod "normal" (com `.record()`,
`.min()/.max()` em arrays e numeros) via `z.toJSONSchema()` — nenhuma delas e incomum ou "exotica"
do lado do Zod, sao praticas idiomaticas.

## Decisao

Para todo `outputSchema` passado a `provider.chat()`, especialmente quando o campo puder ser gerado
para a Anthropic:

- **Config/payload de forma livre vira string, nao objeto**: quando um campo precisa aceitar um
  formato dinamico (ex.: `node.config` do Autocomplete/Copilot, que varia por tipo de node), ele e
  descrito ao LLM como um campo `string` contendo JSON serializado (`configJson`/`proposedGraphJson`),
  nunca como um objeto de forma livre (`z.record()`/`z.unknown()`). O parse de volta pra objeto (e a
  validacao "de verdade" contra o schema real, ex. `workflowGraphSchema`) acontece depois, no
  backend — nunca dentro do proprio outputSchema estrito.
- **Sem `.min()/.max()` em arrays**: limites de tamanho de lista (ex.: "no maximo 3 sugestoes") sao
  reforcados no codigo apos o parse (`slice(0, 3)`), nunca via `z.array().min().max()`.
- **Sem `.int()/.min()/.max()` em numeros**: campos numericos no schema estrito usam `z.number()`
  puro; faixas praticas (ex.: 1-10 tentativas de retry) sao aplicadas via `clamp()` no codigo,
  arredondando com `Math.round()` quando necessario.
- **`toStrictJsonSchema()`** (`packages/ai/src/schema-utils.ts`) continua responsavel só por
  garantir `additionalProperties: false` em objetos que nao o declaram — ele nao tenta detectar/
  remover minItems/maximum, essa responsabilidade e do autor do schema Zod (ver os 3 usos em
  `autocomplete.service.ts`, `debugger.service.ts`, `copilot.service.ts`).

## Alternativas consideradas

- **Nao usar outputSchema, so instrucao em texto no prompt**: mais simples, mas nas 3 features a
  saida sem schema tinha taxa de erro de parse muito mais alta nos testes reais (formato divergente,
  texto explicativo antes/depois do JSON). outputSchema com as constraints acima removidas continua
  sendo a opcao mais confiavel.
- **Uma camada de traducao automatica Zod → "JSON Schema seguro para Anthropic"**: mais robusto a
  longo prazo (evitaria descobrir cada constraint na maozinha), mas exigiria mapear todas as
  particularidades de CADA provider (OpenAI, Gemini, Ollama tem seus proprios limites, nem todos
  documentados). Fora de escopo para a Fase 11; considerar se mais features de saida estruturada
  forem adicionadas e o padrao "string com JSON serializado" comecar a ficar repetitivo demais.

## Consequencias

- Qualquer novo uso de `outputSchema` com Anthropic neste codebase deve seguir as 3 regras acima
  desde o primeiro rascunho do schema Zod, em vez de descobrir por tentativa e erro (como aconteceu
  aqui — 3 rodadas de erro 400 diferentes em sequencia durante o desenvolvimento da Fase 11).
- Os schemas "de frente pro LLM" (`llmGraphSchema`, `suggestionSchema`, `copilotResponseSchema`) sao
  deliberadamente MAIS PERMISSIVOS que os schemas de validacao real (`workflowGraphSchema`) — a
  validacao rigorosa (tipos de node existentes, edges validas, ranges numericos) sempre acontece
  depois do parse, no backend, nunca delegada ao proprio outputSchema.
