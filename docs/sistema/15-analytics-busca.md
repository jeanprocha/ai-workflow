# Analytics e busca global

> Última revisão: 2026-08-03 · commit `93468bf`

## O que faz

Este é o andar de leitura agregada da plataforma: dois módulos pequenos que não têm tabela própria e não escrevem nada. Eles existem para responder duas perguntas transversais que nenhum outro domínio responde — "como o workspace está indo?" e "onde está aquela coisa?". Tudo o que eles fazem é consultar tabelas que pertencem a outros domínios (`Execution`, `ExecutionStep`, `AiSuggestion`, `Workflow`, `Template`, `Agent`) e devolver o resultado já mastigado para a UI.

**Analytics** é a agregação. São quatro leituras independentes: um resumo de números do workspace inteiro, uma série temporal por dia, as execuções mais recentes e o custo quebrado por provider de IA. O que vale entender é o que cada uma cobre no tempo: o resumo e o custo por provider olham o **histórico inteiro** do workspace, sem janela nenhuma — os números só crescem, nunca decaem. Só a série temporal tem recorte, e ele é do chamador: um parâmetro de dias, com padrão de 14 e teto de 365 no controller. O teto não é cosmético — sem ele, um valor absurdo faz o Postgres estourar ao construir o `interval` e o erro sobe como 500 genérico, o que já foi corrigido uma vez.

O custo agregado tem uma sutileza que explica a arquitetura do resumo. A execução de fluxo guarda seus totais denormalizados na própria linha de `Execution` (a engine acumula token e custo dos nodes e grava no fim), então o custo de fluxo sai de um `aggregate` simples. Mas as quatro features de IA de plataforma — geração, copilot, debugger, otimizador — não passam pela engine e não produzem `Execution` nenhuma; o custo delas mora em `AiSuggestion`. O resumo soma os dois, senão o custo de IA no dashboard sairia subestimado. Já o custo por provider é a única leitura que desce até `ExecutionStep`, porque é lá que existe a coluna `model` — o provider não é gravado em lugar nenhum, ele é **derivado** do id do modelo consultando o registro de modelos em memória, e qualquer modelo que não esteja no registro cai num balde chamado `desconhecido`.

Tudo em analytics passa por cache Redis, com TTL curto e chave por workspace: 30 segundos para o resumo, 10 para as recentes, 60 para série temporal e custo por provider. O cache é ingênuo de propósito — só `getOrSet`, sem invalidação em escrita. Rodar um fluxo novo e voltar para o dashboard mostra números defasados até o TTL vencer, e isso é a armadilha número um de qualquer teste automatizado desses endpoints: semear os dados **antes** de ler, nunca depois.

**Busca** é o outro módulo, e é deliberadamente rasa. Uma rota só, um parâmetro de texto, cinco grupos de resultado — fluxos, nodes, execuções, templates e agentes — com no máximo cinco itens cada. Não há full-text, não há índice invertido, não há ranking: os quatro grupos que batem em banco usam `contains` case-insensitive do Prisma, que vira um `ILIKE '%termo%'` puro, e a ordem é a que o banco devolver. O grupo de nodes é ainda mais direto e é o ponto quente do módulo: como o grafo é uma coluna JSON, não dá para filtrar por label em SQL, então o serviço **carrega todos os fluxos do workspace** com o grafo da versão atual junto e varre os nodes em memória, parando quando junta cinco. Execuções, apesar do nome do grupo, não são casadas por id nem por status — casam pelo nome do fluxo a que pertencem.

A fronteira de workspace é respeitada pelos dois módulos, e da mesma forma: `WorkspaceGuard` no controller, id do workspace vindo do header validado, e todo `where` ancorado nele — direto onde a tabela tem `workspaceId`, ou via relação (`execution → workflow → workspaceId`) onde não tem. A única travessia é intencional e vem do modelo de templates: a busca inclui os templates globais (os de `workspaceId` nulo, o catálogo seedado) junto com os do workspace, exatamente como faz a listagem de templates.

## Onde vive

| Arquivo                                             | Papel                                                                                         |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `apps/api/src/analytics/analytics.controller.ts`    | As quatro rotas de leitura; é onde o parâmetro de dias é sanitizado e limitado a 365.         |
| `apps/api/src/analytics/analytics.service.ts`       | As quatro agregações, cada uma embrulhada no cache com seu TTL.                               |
| `apps/api/src/search/search.controller.ts`          | Rota única de busca; passa string vazia quando não vem query.                                 |
| `apps/api/src/search/search.service.ts`             | As quatro queries paralelas mais a varredura de labels de node em memória.                    |
| `apps/api/src/cache/cache.service.ts`               | `getOrSet` sobre a mesma instância Redis do BullMQ; módulo `@Global`, sem invalidação.        |
| `packages/ai/src/models.ts`                         | `getModelInfo`, usado para derivar o provider a partir do id do modelo no custo por provider. |
| `apps/web/src/hooks/use-analytics.ts`               | Os quatro hooks React Query do dashboard e da página de analytics.                            |
| `apps/web/src/hooks/use-search.ts`                  | Hook de busca global; só dispara com query não vazia.                                         |
| `apps/web/src/components/shell/command-palette.tsx` | O consumidor da busca: diálogo do Ctrl+K, com debounce de 250 ms.                             |
| `apps/web/src/components/charts/simple-charts.tsx`  | `LineChart` e `BarList` — SVG escrito à mão, sem biblioteca de gráficos.                      |
| `apps/e2e/tests/analytics/`                         | Suíte E2E de dashboard, analytics e API pura (`api.spec.ts`).                                 |
| `apps/e2e/tests/search-scheduler/search.spec.ts`    | Suíte E2E da palette, com as armadilhas de locator documentadas no cabeçalho.                 |

**Rotas da API**

| Rota                               | O que faz                                                                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /analytics/summary`           | Contagem de fluxos, de execuções, de steps com token, duração média, falhas, taxa de falha, custo e tokens totais — sem janela de tempo. |
| `GET /analytics/timeseries?days=`  | Execuções, falhas, tokens e custo por dia; padrão 14 dias, teto 365.                                                                     |
| `GET /analytics/recent-executions` | As cinco execuções mais recentes do workspace, com o nome do fluxo.                                                                      |
| `GET /analytics/cost-by-provider`  | Custo e tokens somados por provider, derivados de `ExecutionStep.model`.                                                                 |
| `GET /search?q=`                   | Busca global nos cinco grupos; devolve todos os grupos vazios se a query for vazia.                                                      |

**Páginas web**

| Página                             | O que faz                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| `/dashboard`                       | Seis cards a partir do resumo mais a tabela das execuções recentes.                               |
| `/analytics`                       | Quatro cards do resumo, dois gráficos de linha da série temporal e a barra de custo por provider. |
| Command palette (`Ctrl+K`/`Cmd+K`) | Não é rota: é um diálogo montado pelo `AppShell` em toda página autenticada.                      |

**Models Prisma** — nenhum. Os dois módulos são estritamente de leitura sobre modelos de outros domínios: `Execution` e `ExecutionStep` ([Engine de execução](01-engine-execucao.md)), `AiSuggestion` ([IA de plataforma](11-ai-plataforma.md)), `Workflow` ([Workflows e versionamento](02-workflows-versionamento.md)), `Template` e `Agent`.

## Como se conecta

- Depende de [Auth e workspaces](12-auth-workspaces.md): os dois controllers usam `WorkspaceGuard`, e o `JwtAuthGuard` global do `app.module.ts` já garante o usuário autenticado antes disso. Nenhuma rota daqui é pública.
- Lê o que a [Engine de execução](01-engine-execucao.md) escreve: os totais denormalizados em `Execution` e o par `model`/`costUsd`/`tokens` de cada `ExecutionStep`. Analytics é consumidor puro desse rastro — se a engine não gravar, o dashboard não mostra.
- Lê o custo das features de [IA de plataforma](11-ai-plataforma.md) direto de `AiSuggestion`, que é o único lugar onde o custo de IA fora da engine existe.
- Complementa [Observabilidade e deploy](14-observabilidade-deploy.md) sem se confundir com ela: métricas Prometheus e logs estruturados são para operar o sistema; analytics é a visão de produto, por workspace, servida pela API da aplicação.
- A busca lê [Workflows e versionamento](02-workflows-versionamento.md) (nome do fluxo e grafo da versão atual), templates e [Agents](08-agents.md), e é consumida só pela command palette descrita em [Web e editor](13-web-editor.md).
- O [Catálogo de nodes](03-nodes-catalogo.md) entra de lado: o que a busca casa é o `label` que o usuário deu ao node no editor, não o tipo do node nem sua config.

## Decisões e histórico

- **Não existe ADR nem spec de produto para analytics ou para a busca global.** Nem `docs/adr/` nem `docs/produto/` têm documento dedicado a qualquer um dos dois — ambos nasceram como implementação direta de fase (`914103d` para a busca, Fase 9 para o dashboard) e as decisões que valem estão nos comentários do código e nos roteiros de teste.
- [ADR-010](../adr/010-observabilidade.md) — item 5 explica por que o resumo soma `AiSuggestion`: até a telemetria de IA ser persistida, o custo das quatro features de plataforma era invisível no dashboard, que só contava execução de fluxo.
- [ADR-006](../adr/006-multi-tenancy.md) — a razão de todo `where` daqui ser ancorado no workspace, e também a razão de os templates globais (`workspaceId` nulo) aparecerem na busca de qualquer workspace.
- [ADR-001](../adr/001-orm-prisma.md) — o Prisma como ORM; a série temporal é a exceção que usa `$queryRaw` porque `date_trunc` com agregação condicional não tem equivalente no query builder.
- [09-dashboard-analytics.md](../testing/manual/09-dashboard-analytics.md) e [11-busca-scheduler.md](../testing/manual/11-busca-scheduler.md) — os roteiros manuais registram como "notas técnicas conhecidas" boa parte das limitações abaixo: cache defasado, teto de cinco linhas, gráficos sem eixo, busca sem indicador de carregamento.
- `3cab4b3` — a suíte E2E de analytics, cujo commit documenta os quatro bugs reais encontrados ao escrevê-la, entre eles o 500 do `days` gigante que originou o clamp no controller.

## Limitações e fora de escopo

- **O resumo e o custo por provider não têm janela de tempo.** São o histórico inteiro do workspace, então "custo total" é acumulado desde sempre e nunca cai. Não há filtro de período, nem comparação com período anterior, nem recorte por fluxo.
- **A soma das barras de custo por provider não bate com o card de custo total.** As barras vêm só de `ExecutionStep`; o card soma também o custo de `AiSuggestion`. Steps cujo modelo não está no `MODEL_REGISTRY` ainda caem no balde `desconhecido`, o que empurra a diferença para o outro lado.
- **Custo de IA fora da engine e fora das sugestões é invisível.** O chat direto com agente (`POST /agents/:id/chat`) calcula tokens e custo e devolve na resposta, mas não persiste nada; a ingestão de embeddings também não grava custo. Nenhum dos dois aparece em analytics.
- **`aiRequestsCount` é uma proxy, não uma contagem de chamadas.** É o número de `ExecutionStep` com `tokens` não nulo — um step de agente que fez cinco chamadas ao provider conta como um.
- **Execução cancelada não conta como falha.** A taxa de falha compara só `status = 'failed'` contra o total, então `canceled` dilui a taxa em vez de somar a ela.
- **A série temporal não preenche buracos.** Dias sem execução nenhuma simplesmente não voltam na lista, e os gráficos os omitem em vez de desenhar zero — uma semana com dois dias de uso vira uma linha de dois pontos, não de sete. A granularidade também é fixa por dia; não há visão por hora.
- **A API devolve mais do que a UI mostra, e a UI mostra menos do que poderia.** A série temporal traz tokens e custo por dia, e nada na página os plota. O resumo traz oito campos e a página de analytics usa quatro. Do outro lado, não existe endpoint de percentil (p95 de duração), de custo por fluxo, nem exportação em CSV.
- **`recent-executions` faz over-fetch grave.** A consulta usa `include` sem `select`, então cada uma das cinco linhas vem com `inputPayload` e `outputPayload` inteiros — blobs JSON que a tabela do dashboard não usa e que ainda são serializados para dentro do Redis. É o mesmo tipo de problema que motivou separar `ExecutionPausedState` numa tabela à parte.
- **Cache sem invalidação.** Nenhuma escrita limpa as chaves; a única saída da defasagem é o TTL vencer. Não há `stale-while-revalidate` nem proteção contra estouro simultâneo — vários pedidos no mesmo instante de cache-miss recalculam todos em paralelo.
- **Nenhum índice sustenta essas agregações.** `executions` tem índice em `workflow_id` e `trace_id`, mas **não em `started_at`**, que é justamente o filtro da série temporal. `execution_steps` tem índice só em `execution_id` — o agrupamento por `model` sobre todo o histórico do workspace é varredura, e cresce sem teto porque não há janela de tempo nem retenção. Hoje o cache de 60 segundos é o que segura isso.
- **A busca não usa índice nenhum.** `ILIKE '%termo%'` com curinga à esquerda não aproveita índice B-tree, e não há extensão de trigram nem coluna `tsvector` no schema. Em três tabelas isso é sequencial por definição.
- **A busca de nodes carrega o workspace inteiro em memória a cada tecla.** O serviço puxa todos os fluxos com o grafo da versão atual embutido, mesmo que nenhum label vá casar, e o corte em cinco acontece só depois, em JavaScript. O custo cresce com número de fluxos vezes tamanho do grafo, e o debounce de 250 ms da palette é a única contenção.
- **Qual dos nodes que casam aparece é indeterminado.** Não há `orderBy` na consulta de fluxos e o laço interrompe no quinto acerto global, então dois fluxos com labels parecidos podem alternar entre buscas idênticas.
- **Só a versão atual é buscável.** Nodes de versões anteriores do fluxo não entram, e fluxos que nunca tiveram grafo salvo (sem `currentVersion`) não contribuem com node nenhum.
- **Fluxo arquivado aparece normalmente.** A busca não filtra `Workflow.status`, então rascunhos e arquivados vêm junto com os ativos, sem qualquer marcação que os distinga na palette.
- **A cobertura é mais estreita do que "busca global" sugere.** Não entram bases de conhecimento, documentos nem chunks (busca em KB é semântica e escopada a uma base — ver [Bases de conhecimento e RAG](09-knowledge-rag.md)), nem credenciais, servidores MCP, conversas de chat/inbox ou aprovações pendentes. Também não entram descrições: só o campo `name` de fluxo, template e agente é comparado, e a descrição do fluxo, a descrição e a categoria do template e o prompt do agente ficam de fora.
- **Buscar por execução é indireto.** O grupo "Execuções" casa pelo nome do fluxo, não por id, status ou mensagem de erro — colar um id de execução na palette não encontra nada.
- **Teto de cinco por grupo, sem paginação e sem contagem total.** Não há "ver todos os N resultados": o usuário não sabe se havia cinco acertos ou quinhentos. A busca também não tem cache, ao contrário de analytics.
- **A palette não sinaliza carregamento** (decisão de produto registrada no roteiro manual), e os grupos de template e de agente navegam para a rota da lista, não para o item específico.
