# Visão geral

> Última revisão: 2026-08-02 · commit `80da213`

## O que faz

O Workflow AI Platform é uma plataforma de automação onde o usuário desenha um grafo de nodes num editor visual e a plataforma executa esse grafo — com o diferencial de que IA é cidadã de primeira classe: há nodes de LLM, agentes reutilizáveis com memória e ferramentas, bases de conhecimento com busca vetorial, servidores MCP, e uma camada de IA que ajuda a construir o próprio workflow.

Um usuário pertence a um ou mais **workspaces**, e o workspace é a fronteira de tudo: fluxos, credenciais, agentes, bases de conhecimento e execuções pertencem a ele. Dentro de um workspace, o objeto central é o **workflow** — um grafo de nodes conectados por edges. Salvar o grafo cria uma **versão** imutável; disparar o workflow cria uma **execução**, que a engine percorre node a node registrando cada passo.

O sistema é dividido em dois processos que compartilham o mesmo código e o mesmo banco: a **API** (NestJS, porta 3333) atende as requisições HTTP e enfileira trabalho, e o **worker** (mesmo codebase, entrypoint diferente) consome as filas do Redis e é quem de fato executa os grafos. Essa separação é deliberada e tem consequência prática imediata: `pnpm dev` sobe web e API, **não** sobe o worker. Quem esquece disso vê execuções nascerem e ficarem `queued` para sempre.

Uma execução pode ser disparada por seis portas de entrada diferentes — botão manual, webhook, agendamento cron, mensagem de chat, chamada à API pública do fluxo, ou falha de outro fluxo — e pode **pausar no meio** esperando uma decisão humana, retomando dias depois de onde parou. Essa pausa durável é o mecanismo mais recente e mais estrutural do sistema.

## Onde vive

O monorepo é gerenciado por pnpm workspaces + Turborepo. Sete pacotes:

| Workspace          | Caminho           | Papel                                                                                                                                                    |
| ------------------ | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@workflow/api`    | `apps/api`        | NestJS 11. Dois entrypoints: `src/main.ts` (API HTTP) e `src/worker.main.ts` (worker das filas). Prisma/Postgres, Redis/BullMQ, JWT, Sentry, Prometheus. |
| `@workflow/web`    | `apps/web`        | Next.js 16 (App Router, React 19). Editor visual com `@xyflow/react`, dashboards, páginas públicas. Tailwind 4, React Query, i18n pt-BR.                 |
| `@workflow/e2e`    | `apps/e2e`        | Playwright. 45 specs por feature; 13 marcadas `@smoke` (o recorte que o CI roda).                                                                        |
| `@workflow/shared` | `packages/shared` | Tipos e lógica pura usados por API e web: formato do grafo, tipos de workflow, `EXECUTION_PHASE`, diff de grafos.                                        |
| `@workflow/nodes`  | `packages/nodes`  | O catálogo de nodes (51 definições no registry) + o resolvedor de expressões `{{ }}` + extração de texto.                                                |
| `@workflow/ai`     | `packages/ai`     | Abstração de providers de LLM (OpenAI, Anthropic, Gemini, Ollama), tabela de preço/capacidade por modelo, cliente MCP, rate limiter.                     |
| `@workflow/ui`     | `packages/ui`     | Design system consumido em código-fonte (sem build), com os tokens CSS.                                                                                  |

**Os domínios, um por documento**

| Doc                                                        | Cobre                                                                        |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [Engine de execução](01-engine-execucao.md)                | Como um grafo vira execução: ondas, sandbox, filas, retry/replay, suspensão. |
| [Workflows e versionamento](02-workflows-versionamento.md) | O grafo, o save, versões imutáveis, rollback, diff.                          |
| [Catálogo de nodes](03-nodes-catalogo.md)                  | Anatomia de um node, famílias, expressões `{{ }}`, como adicionar um node.   |
| [Aprovação humana](04-aprovacao-humana.md)                 | Pausa durável, pendências, link público de decisão, varredura de expirados.  |
| [Flow API pública](05-flow-api-publica.md)                 | Publicar um fluxo como endpoint HTTP, chaves `wfk_`, síncrono e assíncrono.  |
| [Triggers e scheduler](06-triggers-scheduler.md)           | As seis portas de entrada e o agendamento cron.                              |
| [Chat e inbox](07-chat-inbox.md)                           | Chat público por fluxo, conversas persistidas, atendimento humano.           |
| [Agentes](08-agents.md)                                    | Agentes reutilizáveis: persona, ferramentas, memória, base de conhecimento.  |
| [Knowledge e RAG](09-knowledge-rag.md)                     | Ingestão de documentos, chunking, embeddings, busca vetorial no pgvector.    |
| [MCP](10-mcp.md)                                           | Servidores MCP, descoberta de tools, health-check.                           |
| [IA da plataforma](11-ai-plataforma.md)                    | Copilot, geração de fluxo, diagnóstico de execução, otimizador de custo.     |
| [Auth e workspaces](12-auth-workspaces.md)                 | Autenticação, multi-tenancy, credenciais, variáveis, templates, alertas.     |
| [Web e editor](13-web-editor.md)                           | Rotas, o editor de grafo, o middleware de rotas públicas, hooks de dados.    |
| [Observabilidade e deploy](14-observabilidade-deploy.md)   | Métricas, logs, health, CI, Railway e Vercel.                                |
| [Analytics e busca](15-analytics-busca.md)                 | Agregações do dashboard, custo por provider, busca global.                   |

Alguns módulos de `apps/api/src/` são infraestrutura transversal e não têm doc próprio — aparecem citados nos domínios que os usam. Os que não são mencionados em nenhum outro lugar: `prisma` (o client injetável), `i18n` (decorator de idioma, filtro de exceção e o dicionário `pt-to-en`) e `types` (declarações de tipo do Express).

**Filas BullMQ** — declaradas em `apps/api/src/queue/queue.module.ts`:

| Fila         | Processa                                                                |
| ------------ | ----------------------------------------------------------------------- |
| `executions` | Rodar um grafo (e retomar um pausado).                                  |
| `ingestion`  | Chunking + embedding de documentos enviados a uma base de conhecimento. |
| `mcp-health` | Sonda periódica dos servidores MCP conectados.                          |
| `schedules`  | Jobs repetíveis dos triggers cron.                                      |
| `approvals`  | Varredura de aprovações expiradas e retomadas travadas.                 |

**Banco** — 27 models em `apps/api/prisma/schema.prisma`. Postgres 16 com a extensão pgvector.

## Como rodar

```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d
cp apps/api/.env.example apps/api/.env
pnpm --filter @workflow/api prisma:migrate
pnpm dev
```

O docker compose sobe Postgres em `5433`, Redis em `6380` e o Mailpit em `1025` (SMTP) / `8025` (interface web — é dali que a suíte E2E lê os emails). O `pnpm dev` sobe web em `3000` e API em `3333`.

**O worker é um processo à parte e precisa ser iniciado à mão:**

```bash
pnpm --filter @workflow/api dev:worker
```

Sem ele, nenhuma execução sai de `queued`. Ele expõe as próprias métricas na `3334`.

O seed popula o catálogo de templates globais — sem ele a tela de templates fica vazia. Ele **não** cria usuário: a primeira conta sai do cadastro normal em `/register`.

```bash
pnpm --filter @workflow/api prisma:seed
```

Perfil opcional de observabilidade (Prometheus em `9090`, Grafana em `3005`):

```bash
docker compose -f docker-compose.dev.yml --profile observability up -d
```

Scripts do monorepo: `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format`, `pnpm test:e2e`.

## Glossário

Vocabulário que aparece em todos os outros documentos e no código.

**Workspace** — a fronteira de multi-tenancy. Todo recurso pertence a um workspace; nenhuma query cruza essa fronteira. A única exceção documentada são templates globais.

**Grafo** — a estrutura `{ nodes, edges }` que descreve o workflow. É JSON, mora numa coluna, e é validado contra o catálogo de nodes ao salvar.

**Versão** — snapshot imutável e numerado do grafo, criado a cada save. O workflow aponta para a versão corrente; execuções rodam sempre o snapshot, nunca o rascunho em edição.

**Onda (wave)** — o conjunto de nodes prontos para rodar ao mesmo tempo. A engine percorre o grafo onda a onda; a onda seguinte só começa quando a anterior inteira termina. É o que dá paralelismo real ao fan-out.

**Sandbox** — o `worker_thread` onde cada node roda. Tem timeout duro, limite de heap e allowlist de variáveis de ambiente. O que o node precisa do processo principal (ler credencial, chamar agente, buscar na KB) atravessa por RPC.

**Expressão `{{ }}`** — referência resolvida em tempo de execução contra o input, o `$vars` e os outputs dos nodes já executados. Resolvida imediatamente antes de o node entrar no sandbox.

**`$vars`** — o dicionário de variáveis de runtime que atravessa a execução. Cada step grava em `varsPatch` o patch que produziu, o que permite reconstituir o `$vars` num replay parcial.

**`EXECUTION_PHASE`** — a tabela exaustiva em `packages/shared/src/execution.ts` que classifica cada status de execução em `pending`, `waiting` ou `terminal`. Quem precisa saber "isso já terminou?" deriva dali. Manter listas paralelas à mão já causou bug em produção.

**Descritor de suspensão** — o que um node devolve, no lugar de um output, quando precisa pausar a execução. A engine não interpreta o conteúdo: só congela o estado e para. É genérico por construção, embora hoje só a aprovação humana o use.

**Frontier** — o estado vivo da execução no momento da pausa (outputs acumulados, `$vars`, buffers de merge, nodes já executados, custos). É o que vai serializado para o banco e restaurado na retomada.

**Error workflow** — outro workflow do mesmo workspace, configurado para ser disparado quando este falha. A cadeia tem profundidade máxima 1.

## Decisões e histórico

Este documento descreve **o que existe hoje**. O porquê está em outros lugares, que não são atualizados:

- [`docs/adr/`](../adr/) — 11 decisões arquiteturais, cada uma com contexto e consequências. As mais estruturais: [ADR-005](../adr/005-isolamento-execucao-nodes.md) (isolamento de nodes), [ADR-006](../adr/006-multi-tenancy.md) (multi-tenancy), [ADR-008](../adr/008-worker-separado.md) (worker separado), [ADR-011](../adr/011-pausa-duravel.md) (pausa durável).
- [`docs/produto/base-evolucao.md`](../produto/base-evolucao.md) — o documento-mestre de evolução: o que existe, os gaps em quatro eixos, e os três horizontes H1/H2/H3.
- [`docs/produto/plano-h1.md`](../produto/plano-h1.md) e [`docs/produto/discovery-h2.md`](../produto/discovery-h2.md) + as seis specs `spec-h2-*.md` — o registro de execução de cada entrega, incluindo o que foi deliberadamente deixado de fora e os bugs encontrados no caminho.
- `spec.md`, `plan.md` e `style.md` na raiz — congelados em 2026-07-23. Descrevem a intenção original, que divergiu do produto real. Leia como arqueologia, não como referência.

## Limitações e fora de escopo

Limites que valem para o sistema inteiro; os específicos de cada domínio estão no doc correspondente.

- **Não há documentação de usuário final.** Nada explica ao usuário do produto como criar um fluxo, usar um node ou montar um agente. Esta camada `docs/sistema/` é interna, para quem desenvolve.
- **Não há OpenAPI/Swagger.** A superfície HTTP só está descrita em prosa, aqui e nas specs.
- **RBAC existe como estrutura, não como comportamento.** O papel do membro é carregado e injetado na request, mas nenhuma rota o consulta: `member` pode tudo que `owner` pode. Também não há endpoint de convite — todo workspace tem exatamente um membro, o criador.
- **Não há cancelamento de execução.** O status `canceled` existe no enum e é tratado como terminal, mas nada no repo o escreve.
- **Sem audit log.** Está no H3, junto com RBAC.
- **Os pacotes não têm README próprio.** O ponto de extensão mais provável, `packages/nodes`, está documentado em [Catálogo de nodes](03-nodes-catalogo.md) e em nenhum outro lugar.
