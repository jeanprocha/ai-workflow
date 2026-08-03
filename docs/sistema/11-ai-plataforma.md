# IA de plataforma

> Última revisão: 2026-08-03 · commit `93468bf`

## O que faz

Este é o andar de cima da plataforma: a IA que ajuda a **construir e consertar** os fluxos, e não a IA que os fluxos executam. São quatro features distintas — geração de fluxo a partir de uma descrição, copilot dentro do editor, diagnóstico de execuções que falharam e otimizador de custo — que compartilham um mesmo padrão e uma mesma tabela.

O fio condutor é este, e é a decisão de produto central do domínio: **toda sugestão é revisável — a IA propõe, o humano aplica**. Nenhuma das quatro features escreve no grafo de um fluxo no momento em que gera a proposta. O que elas fazem é gravar uma linha em `AiSuggestion` com o payload da proposta e devolver o id dela. Aplicar é uma segunda chamada, explícita, feita pelo usuário, que só então chama o `saveGraph` normal do editor — passando pelo mesmo versionamento, pela mesma validação de schema e pela mesma autoria de qualquer edição manual. E toda sugestão termina resolvida como `accepted` ou `rejected`, o que dá a base para medir depois quais propostas as pessoas realmente aceitam.

A **geração de fluxo** (módulo `autocomplete`, apesar do nome) recebe uma descrição em linguagem natural e devolve um grafo completo, pronto para virar um fluxo novo. O prompt inclui o catálogo de nodes real, gerado a partir do registro em `@workflow/nodes`, com tipos, categorias e saídas — o modelo é instruído a não inventar tipos fora dessa lista. Se o grafo devolvido não passar na validação, o serviço tenta uma segunda vez realimentando os erros de validação como texto, e desiste depois disso.

O **copilot** é um chat com contexto: recebe o grafo atual do fluxo e as cinco execuções mais recentes (status, duração, custo, tokens, erro) e conversa sobre isso. Quando tem uma proposta concreta, devolve junto com a resposta o grafo completo alterado. Quando não tem, é só conversa. Se a proposta vier malformada, o serviço degrada para a resposta em texto em vez de quebrar o chat.

O **debugger** só opera sobre execuções que falharam. Ele localiza o último step com falha, recupera o node correspondente do grafo daquela versão da execução e monta o prompt com config, retry atual, número da tentativa, mensagem de erro e os logs daquele node. Devolve uma causa provável e até três correções, cada uma de um tipo: `retry`, `timeout` ou `fallback`. Cada correção carrega um sinalizador de aplicabilidade calculado no servidor — `timeout` só é aplicável se o node de fato tiver um campo de timeout na config, e `fallback` não faz sentido em trigger. Os números vindos do modelo passam por clamp antes de virar sugestão.

O **cost optimizer** é o único dos quatro que **não chama LLM nenhum**. É uma heurística sobre histórico real: agrupa os steps bem-sucedidos dos últimos 30 dias por fluxo, node e modelo, ignora grupos com menos de três amostras, e para cada grupo procura no registro de modelos o mais barato de tier igual ou inferior — nunca sugere subir de tier, e nunca sugere migrar para Ollama, porque trocar para um modelo local é decisão de infraestrutura, não ajuste de config. Só vira sugestão se a economia estimada passar de 15%. Aplicar significa reescrever `provider` e `model` na config daquele node.

Tudo isso converge na tabela `AiSuggestion`, que serve como telemetria e como o objeto que o botão "aplicar" consome. Ela guarda a origem (o tipo), o payload específico, o vínculo com fluxo e execução, o desfecho, e — para os três tipos que chamam LLM — o modelo usado e o custo em tokens da própria sugestão. Vale reparar na inversão: a plataforma mede o custo de a IA sugerir uma economia.

## Onde vive

| Arquivo                                                    | Papel                                                                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `apps/api/src/ai-suggestions/ai-suggestions.service.ts`    | Criação, busca, resolução e listagem das sugestões; usado pelos outros quatro módulos.               |
| `apps/api/src/ai-suggestions/ai-suggestions.controller.ts` | Rotas de listagem e resolução manual (`accepted`/`rejected`).                                        |
| `apps/api/src/autocomplete/autocomplete.service.ts`        | Geração de grafo a partir de texto; schema "de frente para o LLM" e retry com feedback de validação. |
| `apps/api/src/copilot/copilot.service.ts`                  | Chat com contexto do fluxo; monta o prompt e valida o grafo proposto.                                |
| `apps/api/src/debugger/debugger.service.ts`                | Diagnóstico de execução falha; calcula aplicabilidade, faz clamp e aplica o patch no node.           |
| `apps/api/src/cost-optimizer/cost-optimizer.service.ts`    | Heurística de troca de modelo sobre `ExecutionStep`; sem chamada a LLM.                              |
| `packages/ai/src/models.ts`                                | `MODEL_REGISTRY`: preço por 1M tokens de entrada/saída, janela de contexto, visão e tier por modelo. |
| `packages/ai/src/schema-utils.ts`                          | `toStrictJsonSchema`, que adapta o JSON Schema às restrições do modo estrito dos providers.          |
| `apps/api/src/workflows/graph.schema.ts`                   | Validação canônica do grafo — todo grafo proposto por IA passa por aqui antes de ser salvo.          |
| `apps/web/src/components/editor/copilot-dialog.tsx`        | O copilot dentro do editor: chat, seleção de provider/modelo e botão de aplicar.                     |
| `apps/web/src/hooks/use-autocomplete.ts`                   | Hook de geração de fluxo, usado no diálogo da lista de fluxos.                                       |
| `apps/web/src/hooks/use-debugger.ts`                       | Hook de diagnóstico, usado na página de detalhe da execução.                                         |

**Rotas da API**

| Rota                                                          | O que faz                                                                   |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `POST /autocomplete/generate`                                 | Gera um grafo completo a partir de uma descrição em linguagem natural.      |
| `POST /workflows/:id/copilot/chat`                            | Conversa sobre o fluxo; pode devolver um grafo proposto e o id da sugestão. |
| `POST /workflows/:id/copilot/suggestions/:suggestionId/apply` | Salva o grafo proposto como nova versão do fluxo.                           |
| `POST /executions/:id/diagnose`                               | Diagnostica uma execução com status `failed`.                               |
| `POST /executions/diagnose/:suggestionId/apply`               | Aplica uma das correções pelo índice na lista.                              |
| `GET /cost-optimizer/analyze`                                 | Analisa o histórico e cria as sugestões de troca de modelo.                 |
| `POST /cost-optimizer/:suggestionId/apply`                    | Reescreve provider e modelo no node indicado.                               |
| `GET /ai-suggestions`                                         | Lista as últimas 50 sugestões, filtráveis por fluxo e por tipo.             |
| `POST /ai-suggestions/:id/resolve`                            | Marca uma sugestão como aceita ou rejeitada.                                |

**Páginas web**

| Página                 | O que faz                                                                   |
| ---------------------- | --------------------------------------------------------------------------- |
| `/cost-optimizer`      | Roda a análise e mostra os cards de troca de modelo com o botão de aplicar. |
| `/flows`               | Traz o diálogo de geração de fluxo por descrição.                           |
| `/executions/[id]`     | Traz o diagnóstico da execução falha e a aplicação das correções.           |
| `/flows/[id]` (editor) | Hospeda o copilot, em diálogo (`copilot-dialog.tsx`).                       |

**Models Prisma** (`apps/api/prisma/schema.prisma`)

| Model          | Uma linha                                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AiSuggestion` | Uma sugestão gerada: tipo (`autocomplete`, `copilot`, `debugger`, `cost_optimizer`), payload, status, vínculo com fluxo/execução e custo em tokens da própria sugestão. |

## Como se conecta

- Depende de [Workflows e versionamento](02-workflows-versionamento.md): aplicar qualquer sugestão é um `saveGraph` comum, então toda edição feita por IA vira uma versão nova e pode ser revertida pelo histórico normal.
- Depende do [Catálogo de nodes](03-nodes-catalogo.md): o prompt de geração é montado a partir do catálogo real, e o debugger interpreta config e retry de nodes concretos.
- Depende de [Observabilidade](14-observabilidade-deploy.md) e da [Engine](01-engine-execucao.md) para os dados de entrada: o cost optimizer lê custo e modelo por step, o copilot lê o resumo das últimas execuções, o debugger lê steps e logs.
- Depende de [Auth e workspaces](12-auth-workspaces.md) para o isolamento e para as credenciais de provider — exceto Ollama, toda chamada exige uma credencial nomeada do workspace, descriptografada no uso.
- Aparece no [Editor web](13-web-editor.md) como copilot embutido e como diálogo de geração; o cost optimizer tem página própria.

## Decisões e histórico

- [ADR-009](../adr/009-saida-estruturada-llm.md) — as três restrições de JSON Schema que o modo estrito da Anthropic rejeita e que explicam os contornos espalhados por estes módulos: `config` do node pedido como string JSON serializada na geração, `z.number()` sem `.min()/.max()` no debugger, e o clamp feito em código depois do parse.
- [ADR-004](../adr/004-formato-grafo.md) — o formato canônico do grafo, que é o contrato que toda proposta de IA precisa satisfazer.
- [ADR-007](../adr/007-criptografia-secrets.md) — como as credenciais de provider usadas por estas features são guardadas.
- [base-evolucao.md](../produto/base-evolucao.md) — item C2 registra que o catálogo de modelos e preços já foi fictício e alimentava tanto o custo real quanto as recomendações do cost optimizer, corrigido em `e2a3fcb`; item C3 registra que o debugger sugeria `fallback` sem mecanismo correspondente na engine, resolvido com `onError: 'branch'` no node.
- Não há ADR sobre o padrão "propor e aplicar em duas etapas" nem sobre a existência da tabela `AiSuggestion` como telemetria compartilhada; a intenção está documentada em comentário no `ai-suggestions.service.ts` e no `schema.prisma`.

## Limitações e fora de escopo

- **Não existe autocomplete de expressões `{{ }}`.** Apesar do nome do módulo, `autocomplete` gera grafos inteiros a partir de uma descrição; o preenchimento assistido de expressões dentro da config de um node não é atendido por este domínio.
- **Aplicar uma sugestão sempre reescreve a versão atual do fluxo**, mesmo que o grafo tenha mudado entre a geração e o clique. Não há detecção de conflito nem verificação de que a proposta ainda faz sentido — no copilot o modelo devolve o grafo inteiro, então uma edição feita nesse intervalo é perdida.
- **A sugestão de `fallback` do debugger é meio-caminho:** ela marca `onError: 'branch'` no node, mas o usuário ainda precisa conectar a saída de erro a algum node no editor para que o caminho alternativo exista de fato.
- **A economia estimada pelo cost optimizer é aproximada.** Ela usa a média entre preço de entrada e de saída porque `ExecutionStep` grava só o total de tokens, sem separar os dois. O tier dos modelos também é uma classificação manual, não um score real de capacidade.
- **`GET /cost-optimizer/analyze` tem efeito colateral:** cada análise cria linhas novas em `AiSuggestion`, então reanalisar repetidamente acumula sugestões duplicadas pendentes.
- **`MODEL_REGISTRY` é uma tabela de preços mantida à mão** (conferida contra a documentação oficial em 2026-07-28) e envelhece sozinha; preços desatualizados contaminam tanto o custo por execução quanto as recomendações.
- **A qualidade da sugestão não é validada além do schema.** Um grafo sintaticamente válido, mas semanticamente sem sentido, é aceito e aplicável — a revisão humana é a única barreira, o que é intencional, mas significa que não há dry-run nem simulação antes de aplicar.
- **A listagem de sugestões é limitada a 50 registros, sem paginação, e não há página web dedicada** — as sugestões aparecem no contexto de cada feature, não como uma fila única.
- **Nada aqui é assíncrono.** Todas as chamadas são síncronas na requisição HTTP, sem streaming (ao contrário do chat de agentes, ver [ADR-003](../adr/003-streaming-sse.md)) e sem fila, então uma geração lenta segura a conexão.
