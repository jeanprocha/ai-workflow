# Documentação

A documentação deste projeto tem **três camadas**, com propósitos diferentes. Saber qual você quer economiza tempo:

| Camada                                         | Pergunta que responde             | Muda?                        |
| ---------------------------------------------- | --------------------------------- | ---------------------------- |
| [Sistema](sistema/)                            | _Como isso funciona hoje?_        | Sim — com carimbo de revisão |
| [Produto e ADRs](#produto--o-porquê-histórico) | _Por que foi feito assim?_        | Não — registro histórico     |
| [Operação](#operação)                          | _Como rodo, testo e faço deploy?_ | Sim, mas sem carimbo         |

Antes de mexer no código, leia também o [`CLAUDE.md`](../CLAUDE.md) da raiz: comandos essenciais, convenções e as armadilhas que já custaram tempo real neste projeto.

**Primeiro dia**: [visão geral](sistema/00-visao-geral.md) → [`CLAUDE.md`](../CLAUDE.md) → o doc do domínio da sua tarefa.

**Travado em alguma coisa?**

| Sintoma                                                   | Onde olhar                                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Execução parada em `queued` para sempre                   | O worker não está rodando — [visão geral](sistema/00-visao-geral.md)                              |
| `chunks_embedding_hnsw_idx` sumiu depois de uma migration | `DROP INDEX` espúrio do Prisma — [`CLAUDE.md`](../CLAUDE.md) e [RAG](sistema/09-knowledge-rag.md) |
| Fluxo em rascunho disparando sozinho                      | O cron não é gateado por status — [triggers](sistema/06-triggers-scheduler.md)                    |
| Custo do dashboard não bate com o de por-provider         | São fontes diferentes, por design — [analytics](sistema/15-analytics-busca.md)                    |
| Aprovação criada mas o link não chega                     | SMTP local é o Mailpit em `:8025` — [aprovação humana](sistema/04-aprovacao-humana.md)            |
| Node novo aparece sem ícone ou sem formulário             | Falta o passo do frontend — [nodes](sistema/03-nodes-catalogo.md)                                 |
| Invoke síncrono devolve 200 com output nulo               | Derive de `EXECUTION_PHASE` — [flow API](sistema/05-flow-api-publica.md)                          |
| Tela de templates vazia                                   | Falta rodar o seed — [visão geral](sistema/00-visao-geral.md)                                     |

---

## Sistema — o estado atual

Comece por **[Visão geral](sistema/00-visao-geral.md)**: mapa do monorepo, como rodar, e o glossário do projeto.

Depois, um documento por domínio:

| Doc                                                                     | Cobre                                                               |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [01 — Engine de execução](sistema/01-engine-execucao.md)                | Ondas, sandbox, filas, retry/replay, suspensão                      |
| [02 — Workflows e versionamento](sistema/02-workflows-versionamento.md) | Grafo, save, versões imutáveis, rollback, diff                      |
| [03 — Catálogo de nodes](sistema/03-nodes-catalogo.md)                  | Anatomia de um node, expressões `{{ }}`, **como adicionar um node** |
| [04 — Aprovação humana](sistema/04-aprovacao-humana.md)                 | Pausa durável, pendências, link público, expiração                  |
| [05 — Flow API pública](sistema/05-flow-api-publica.md)                 | Publicar fluxo como endpoint, chaves `wfk_`, sync/async             |
| [06 — Triggers e scheduler](sistema/06-triggers-scheduler.md)           | As seis portas de entrada e o cron                                  |
| [07 — Chat e inbox](sistema/07-chat-inbox.md)                           | Chat público, conversas, atendimento humano                         |
| [08 — Agentes](sistema/08-agents.md)                                    | Persona, ferramentas, memória, KB anexada                           |
| [09 — Knowledge e RAG](sistema/09-knowledge-rag.md)                     | Ingestão, chunking, embeddings, busca vetorial                      |
| [10 — MCP](sistema/10-mcp.md)                                           | Servidores, descoberta de tools, health-check                       |
| [11 — IA da plataforma](sistema/11-ai-plataforma.md)                    | Copilot, geração de fluxo, diagnóstico, custo                       |
| [12 — Auth e workspaces](sistema/12-auth-workspaces.md)                 | Autenticação, multi-tenancy, credenciais, variáveis, templates      |
| [13 — Web e editor](sistema/13-web-editor.md)                           | Rotas, editor de grafo, rotas públicas, hooks                       |
| [14 — Observabilidade e deploy](sistema/14-observabilidade-deploy.md)   | Métricas, logs, health, CI, Railway, Vercel                         |
| [15 — Analytics e busca](sistema/15-analytics-busca.md)                 | Agregações do dashboard, custo por provider, busca global           |

Estes documentos são **finos de propósito**: descrevem conceitos estáveis e apontam onde as coisas vivem. Detalhes voláteis (contratos, payloads, assinaturas) ficam no código, que é a fonte de verdade. Cada doc carrega no topo a data e o commit da última revisão.

Manutenção: ver [Como manter esta documentação](#como-manter-esta-documentação) no fim desta página.

---

## Produto — o porquê histórico

Estes documentos **não são atualizados**. Cada um registra uma decisão ou uma entrega no momento em que aconteceu, e é assim que devem ser lidos.

**A cadeia de evolução**, em ordem de leitura:

1. [`produto/base-evolucao.md`](produto/base-evolucao.md) — o documento-mestre. O que existe, baseline de mercado, gaps em quatro eixos, o que deliberadamente não priorizar, e os três horizontes H1/H2/H3.
2. [`produto/plano-h1.md`](produto/plano-h1.md) — H1 (hardening, testes, CI, Sentry, reset de senha, alertas). Plano e checklist no mesmo arquivo, com o que ficou de fora e por quê.
3. [`produto/discovery-h2.md`](produto/discovery-h2.md) — discovery somente-leitura dos seis temas do H2, com veredicto e evidência `arquivo:linha` por tema.
4. As seis specs do H2, uma por entrega: [correções de passagem](produto/spec-h2-01-correcoes-passagem.md) · [templates CRUD](produto/spec-h2-02-templates-crud.md) · [node de código](produto/spec-h2-03-node-codigo.md) · [publicar como API](produto/spec-h2-04-publicar-como-api.md) · [continue-on-error e error workflow](produto/spec-h2-05-continue-on-error-error-workflow.md) · [aprovação humana](produto/spec-h2-06-aprovacao-humana.md).
5. [`produto/spec-pendencias-2026-08.md`](produto/spec-pendencias-2026-08.md) — inventário do que ficou em aberto depois do H2, levantado ao construir a camada de sistema e ao deployar. 39 itens em seis grupos, com evidência e ordem sugerida.

**Decisões arquiteturais** — [`adr/`](adr/), 11 registros no formato do [template](adr/template.md):

| ADR                                         | Decisão                           |
| ------------------------------------------- | --------------------------------- |
| [001](adr/001-orm-prisma.md)                | Prisma como ORM                   |
| [002](adr/002-vector-db-pgvector.md)        | pgvector como vector store        |
| [003](adr/003-streaming-sse.md)             | SSE para streaming de logs        |
| [004](adr/004-formato-grafo.md)             | Formato do grafo de workflow      |
| [005](adr/005-isolamento-execucao-nodes.md) | Isolamento de execução de nodes   |
| [006](adr/006-multi-tenancy.md)             | Multi-tenancy por workspace       |
| [007](adr/007-criptografia-secrets.md)      | Criptografia de secrets           |
| [008](adr/008-worker-separado.md)           | Worker separado da API            |
| [009](adr/009-saida-estruturada-llm.md)     | Saída estruturada entre providers |
| [010](adr/010-observabilidade.md)           | Camada de observabilidade         |
| [011](adr/011-pausa-duravel.md)             | Pausa durável da execução         |

**Documentos congelados na raiz do repo** — `spec.md`, `plan.md` e `style.md`, de 2026-07-23. Descrevem a intenção original do produto, que divergiu do que foi construído. Leia como arqueologia; para o estado atual use a camada de sistema.

---

## Operação

- **Deploy**: [`deploy/railway.md`](deploy/railway.md) (API + worker) e [`deploy/vercel.md`](deploy/vercel.md) (web). O doc do Railway lista as variáveis de ambiente por fase de entrega, mas **não é um catálogo completo** — várias variáveis citadas nos docs de sistema não estão lá. A referência exaustiva é `apps/api/.env.example`.
- **Testes**: [`testing/plano-de-testes.md`](testing/plano-de-testes.md) — filosofia local-first e como rodar. Roteiros de verificação manual em [`testing/manual/`](testing/manual/), numerados pelas fases do `plan.md` original (param na fase 11; nada do H1/H2 foi coberto ainda).
- **Performance**: [`perf/fase-10-load-test.md`](perf/fase-10-load-test.md) — defasado, de 2026-07-24, anterior às mudanças de engine. Precisa ser reexecutado.
- **Integrações**: [`integracoes/rein.md`](integracoes/rein.md) (receita de HMAC no ERP Rein, usando o node HTTP genérico) e [`integracoes/whatsapp.md`](integracoes/whatsapp.md) (planejado, não iniciado).

---

## Como manter esta documentação

**A regra**: toda mudança funcional atualiza o documento do domínio correspondente em [`sistema/`](sistema/), no mesmo commit, incluindo o carimbo `> Última revisão: AAAA-MM-DD · commit ...` do topo.

O que conta como mudança funcional: rota nova ou removida, model novo no Prisma, fila nova, mudança de comportamento observável, limitação que deixou de existir. O que não conta: refactor interno, renomear variável, ajuste de estilo.

Os documentos de `produto/` e `adr/` **nunca** são reescritos. Se uma decisão mudou, escreva um ADR novo que supere o anterior; se uma entrega foi além da spec, o registro disso vai no doc de sistema, não na spec.

Quando um domínio novo surgir (um módulo em `apps/api/src/` que não se encaixa em nenhum dos quinze), crie o doc seguindo o formato dos existentes e adicione ao índice acima e ao de [`sistema/00-visao-geral.md`](sistema/00-visao-geral.md).

**Auditoria de defasagem**: a skill `/doc-sync` compara o carimbo de cada doc com o histórico do git dos arquivos que ele cobre, e atualiza o que ficou para trás. Vale rodar antes de fechar uma entrega grande.
