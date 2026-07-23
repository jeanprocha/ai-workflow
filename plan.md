# Workflow AI Platform — Plano de Implementação (plan.md)

Versão: 1.0
Base: [spec.md](spec.md) v1.0

---

# 1. Visão Geral do Plano

Este plano divide a construção da plataforma em **12 fases incrementais**, agrupadas nos três marcos do roadmap do spec:

| Marco | Fases | Resultado |
|-------|-------|-----------|
| **v1 — MVP** | 0 a 5 | Editor visual + execução real + OpenAI + logs + templates |
| **v2 — Plataforma** | 6 a 9 | MCP, Knowledge/RAG, versionamento, replay, marketplace |
| **v3 — Escala e IA avançada** | 10 a 12 | Execução distribuída, Copilot, AI Debugger, Cost Optimizer |

Princípios que guiam a ordem das fases:

1. **Vertical slice primeiro**: o mais cedo possível (fim da Fase 3) deve existir um fluxo criado no editor, salvo no banco e executado de verdade pela engine — mesmo que com poucos nodes.
2. **Engine antes de variedade de nodes**: a arquitetura de execução (filas, retries, logs, estado) é o coração do produto; nodes são plugins sobre ela.
3. **IA como cidadã de primeira classe**: a abstração de providers de IA (Fase 5) é projetada desde o início para múltiplos modelos, tools, memória e schema de saída — não um "node de OpenAI" hardcoded.
4. **UX premium contínua**: o design system (Fase 1) nasce junto com o produto; nada de "arrumar a UI depois".

---

# 2. Arquitetura de Referência

## 2.1 Monorepo

```
ai-workflow/
├── apps/
│   ├── web/          # Next.js (App Router) — frontend
│   └── api/          # NestJS — API + workers
├── packages/
│   ├── shared/       # Tipos TypeScript compartilhados (Workflow, Node, Execution...)
│   ├── nodes/        # Definições e runtimes dos nodes (registry plugável)
│   ├── ai/           # Abstração de providers (OpenAI, Claude, Gemini, Ollama) + MCP client
│   └── ui/           # Design system (shadcn/ui customizado, tokens, componentes)
├── docker/           # docker-compose (Postgres, Redis, Ollama), Dockerfiles
├── .github/          # CI/CD (GitHub Actions)
└── docs/             # spec.md, plan.md, ADRs
```

Ferramentas: **pnpm workspaces + Turborepo**, TypeScript strict em tudo, ESLint + Prettier compartilhados.

## 2.2 Fluxo de execução (runtime)

```
Trigger (webhook/cron/manual)
   → API cria Execution (status: queued)
   → Job publicado no BullMQ (Redis)
   → Worker consome job
   → Engine resolve o grafo (ordem topológica, branches, paralelismo)
   → Cada node executa via NodeRuntime (registry)
   → Eventos/logs emitidos por node (persistidos + streaming via WebSocket/SSE)
   → Execution finalizada (success | failed | partial)
```

## 2.3 Decisões arquiteturais chave (ADRs a documentar)

| # | Decisão | Direção proposta |
|---|---------|------------------|
| ADR-001 | ORM | Prisma (velocidade de iteração + migrations) |
| ADR-002 | Vector DB | pgvector no próprio PostgreSQL (menos infra; migrar se escalar) |
| ADR-003 | Streaming de logs para o frontend | SSE por execução (simples, unidirecional); WebSocket só se precisar bidirecional |
| ADR-004 | Formato do grafo | JSON próprio versionado (`nodes[]`, `edges[]`, `viewport`) compatível com React Flow |
| ADR-005 | Isolamento de execução de nodes | v1: in-process com timeout/sandbox leve; v3: workers dedicados por tipo |
| ADR-006 | Multi-tenancy | Desde a Fase 2: tudo escopado por `user_id`/`workspace_id` (evita retrofit doloroso) |
| ADR-007 | Criptografia de secrets | AES-256-GCM com chave mestre em env var; nunca retornar valor em GET |

---

# 3. Modelo de Dados (consolidado)

Expande as tabelas do spec com o que a execução real exige:

```
users            (id, email, name, password_hash, created_at)
workspaces       (id, name, owner_id)
workspace_members(workspace_id, user_id, role)

workflows        (id, workspace_id, name, description, status[draft|active|archived],
                  current_version_id, created_at, updated_at)
workflow_versions(id, workflow_id, version_number, graph_json, created_by, created_at)
                  -- graph_json contém nodes + edges + viewport (fonte da verdade)

executions       (id, workflow_id, version_id, status[queued|running|success|failed|canceled],
                  trigger_type, input_payload, output_payload,
                  duration_ms, tokens_total, cost_usd,
                  started_at, finished_at, error, parent_execution_id /*replay*/)
execution_steps  (id, execution_id, node_id, node_type, status,
                  input, output, error, duration_ms, tokens, model, cost_usd,
                  started_at, finished_at, attempt)
execution_logs   (id, execution_id, node_id, level, event, payload, created_at)

agents           (id, workspace_id, name, description, system_prompt,
                  model, temperature, tools_json, memory_config, output_schema, created_at)

credentials      (id, workspace_id, provider, name, encrypted_data, created_at)
variables        (id, workspace_id, key, value, is_secret, scope[global|env|runtime])

knowledge_bases  (id, workspace_id, name, description)
documents        (id, knowledge_base_id, filename, mime_type, status[processing|ready|failed], metadata)
chunks           (id, document_id, content, embedding vector, metadata)

schedules        (id, workflow_id, cron_expression, timezone, enabled, next_run_at)

mcp_servers      (id, workspace_id, name, transport[stdio|sse|http], config_json,
                  status[connected|disconnected|error], last_health_check)

templates        (id, name, category, description, graph_json, is_official)
marketplace_items(id, type[agent|workflow|prompt|template], author_id, name,
                  description, content_json, downloads, rating, published_at)
```

---

# 4. Fases

---

## FASE 0 — Fundação e Infraestrutura

**Objetivo:** repositório pronto para desenvolvimento produtivo, com ambiente reproduzível e CI desde o dia 1.

**Entregas:**
- [ ] Monorepo pnpm + Turborepo com `apps/web`, `apps/api`, `packages/shared`
- [ ] Next.js (App Router, TypeScript, TailwindCSS) rodando com página placeholder
- [ ] NestJS rodando com healthcheck (`GET /health`)
- [ ] `docker-compose.dev.yml`: PostgreSQL 16 (+ extensão pgvector), Redis 7
- [ ] Prisma configurado com migration inicial vazia
- [ ] ESLint, Prettier, tsconfig base compartilhados
- [ ] GitHub Actions: lint + typecheck + build + testes em cada PR
- [ ] `README.md` com setup em 3 comandos (`pnpm i`, `docker compose up -d`, `pnpm dev`)
- [ ] Estrutura de ADRs em `docs/adr/`

**Critério de aceite:** `git clone` → 3 comandos → web e API rodando localmente; CI verde.

---

## FASE 1 — Design System e Shell da Aplicação

**Objetivo:** a "cara Linear/Vercel" do produto, antes de qualquer feature — layout, navegação, tema e componentes base.

**Entregas:**
- [ ] `packages/ui`: shadcn/ui instalado e customizado (tokens de cor, tipografia, radius, sombras)
- [ ] Tema dark-first com suporte a light mode
- [ ] Shell da aplicação: sidebar com as 8 seções do spec (Dashboard, Flows, Agents, Executions, Knowledge, Templates, Marketplace, Settings) + área de conteúdo
- [ ] Command palette `Ctrl+K` (estrutura pronta; busca real vem na Fase 9)
- [ ] Componentes base: Card de métrica, tabela de dados, badge de status, empty states, skeletons, toasts
- [ ] Animações com Framer Motion (transições de página, hover states)
- [ ] Dashboard estático com os 6 cards do spec (Fluxos, Execuções, IA Requests, Tempo médio, Falhas, Custo IA) usando dados mock

**Critério de aceite:** navegação completa entre todas as seções com placeholders visualmente polidos; screenshot já "parece produto".

---

## FASE 2 — Auth, Workspaces e CRUD de Workflows

**Objetivo:** fundação de dados e segurança; workflows persistidos de verdade.

**Entregas:**
- [ ] Schema Prisma: `users`, `workspaces`, `workspace_members`, `workflows`, `workflow_versions`, `credentials`, `variables`
- [ ] Auth: registro, login, JWT (access + refresh), guard global no NestJS
- [ ] Multi-tenancy: todo recurso escopado por workspace (ADR-006)
- [ ] API REST:
  - `GET/POST/PATCH/DELETE /workflows`
  - `GET /workflows/:id` (retorna graph_json da versão atual)
  - `PUT /workflows/:id/graph` (salva grafo — cria/atualiza versão draft)
- [ ] Secrets: CRUD de credentials com criptografia AES-256-GCM (ADR-007); UI em Settings
- [ ] Variáveis globais/environment: CRUD + UI em Settings
- [ ] Frontend: páginas de login/registro; lista de Flows (cards com nome, status, updated_at); criar/renomear/arquivar/deletar
- [ ] React Query configurado com invalidação de cache

**Critério de aceite:** dois usuários distintos não veem os workflows um do outro; secret criado nunca retorna em texto plano pela API.

---

## FASE 3 — Editor Visual (Canvas) + Engine Mínima ⭐ *vertical slice*

**Objetivo:** o coração do produto: desenhar um fluxo e executá-lo de verdade. Ao fim desta fase existe o primeiro fluxo end-to-end.

### 3a — Editor (React Flow)
- [ ] Canvas infinito com zoom, pan, mini mapa, snap-to-grid
- [ ] Paleta de nodes (sidebar do editor) com busca e categorias, drag & drop para o canvas
- [ ] Conexões animadas; validação de conexão (tipos compatíveis, sem ciclos)
- [ ] Painel de configuração do node selecionado (formulário dinâmico gerado pelo schema do node)
- [ ] Salvar/carregar grafo (autosave com debounce + indicador "salvo")
- [ ] Undo/redo, seleção múltipla, copiar/colar, deletar
- [ ] Toolbar: nome do fluxo, botão **Run**, status ativo/inativo

### 3b — Node Registry (`packages/nodes`)
- [ ] Contrato `NodeDefinition`: `type`, `category`, `icon`, `inputs`, `outputs`, `configSchema` (Zod), `execute(ctx)`
- [ ] O mesmo schema Zod gera o formulário no editor e valida na engine
- [ ] Nodes iniciais (mínimo para o slice): **Manual Trigger**, **Webhook Trigger**, **HTTP Request**, **If**, **Set Variables**, **Log/Output**

### 3c — Engine de Execução
- [ ] Schema Prisma: `executions`, `execution_steps`, `execution_logs`
- [ ] BullMQ: fila `executions`, worker no processo da API (separação vem na v3)
- [ ] Engine: parse do grafo → ordenação topológica → execução sequencial com branches (If) → passagem de dados entre nodes (output de A vira input de B via expressões `{{ $node.A.output.x }}`)
- [ ] Resolução de expressões/variáveis nos configs dos nodes
- [ ] Timeout por node, captura de erro, status por step
- [ ] Endpoint `POST /workflows/:id/run` (execução manual com payload)
- [ ] Webhook real: `POST /hooks/:webhookId` dispara o fluxo
- [ ] Streaming de progresso via SSE: frontend mostra cada node acendendo em tempo real no canvas (✔/✖ como na seção "Visualização" do spec)

**Critério de aceite:** criar no editor `Webhook → HTTP Request → If → Log`, salvar, chamar o webhook via curl e ver os nodes acenderem em tempo real no canvas com a execução persistida no banco.

---

## FASE 4 — Biblioteca de Nodes Essenciais

**Objetivo:** cobrir as categorias do spec com os nodes de maior valor, aproveitando a arquitetura de registry da Fase 3.

**Entregas (por categoria):**

- **Triggers:** Cron/Scheduler (tabela `schedules` + BullMQ repeatable jobs), HTTP polling, Manual — *Email/WhatsApp/Discord/Slack/GitHub/Stripe triggers entram junto com as integrações correspondentes*
- [ ] **Logic:** Switch, Loop (com limite de iterações), Delay, Merge, Parallel (fan-out/fan-in na engine), Variables
- [ ] **Database:** PostgreSQL, MySQL, Redis (query/insert/update com credentials do workspace); MongoDB
- [ ] **APIs:** HTTP Request avançado (auth, headers, retry, pagination), GraphQL; REST/SOAP como presets do HTTP
- [ ] **Files:** parse de PDF (texto), CSV, DOCX, TXT, JSON (transform)
- [ ] **Communication:** Email (SMTP), Slack (webhook/bot), Discord, Telegram; Teams/WhatsApp na Fase 9
- [ ] Engine: suporte a **Parallel** (execução concorrente de branches) e **Merge** (join)
- [ ] Retry configurável por node (tentativas, backoff)
- [ ] Testes de integração da engine: fixture de grafo → execução → asserts nos steps

**Critério de aceite:** template "quando chegar webhook, consulta Postgres, decide, envia Email e Slack" funciona de ponta a ponta com retry em falha de rede.

---

## FASE 5 — Camada de IA e AI Nodes 🤖 *fecha o marco v1*

**Objetivo:** o diferencial da plataforma — nodes de IA multi-provider com prompt, tools, memória e schema de saída.

### 5a — Abstração de providers (`packages/ai`)
- [ ] Interface única `AIProvider`: `chat()`, `embed()`, `vision()`, streaming, tool-calling, structured output
- [ ] Implementações: **OpenAI**, **Anthropic (Claude)**, **Google (Gemini)**, **Ollama** (local)
- [ ] Registro de modelos com metadados: contexto máximo, preço por token (input/output), capacidades
- [ ] Contabilização automática de tokens e custo por chamada → gravado em `execution_steps.tokens/cost_usd`
- [ ] Credentials por provider vindas do workspace (Fase 2)

### 5b — AI Nodes
- [ ] Node **Chat/Prompt**: seleção de modelo (qualquer provider), system prompt, temperature, contexto de nodes anteriores, **Output Schema** (JSON Schema → structured output validado)
- [ ] Nodes especializados (presets sobre o Chat): Classification, Translation, Summarization, Extraction
- [ ] Node **Vision** (imagem → texto) e **OCR**
- [ ] Node **Embeddings** (usado também pela Fase 7)
- [ ] UI do node de IA: seletor de modelo com logo do provider, editor de prompt com highlight de variáveis `{{ }}`, preview de custo estimado

### 5c — Agents (reutilizáveis)
- [ ] Schema Prisma: `agents`
- [ ] CRUD + página **Agents**: criar agente com nome, system prompt, modelo, temperature, tools habilitadas, memória
- [ ] Tools iniciais dos agentes: HTTP/Internet, Calculator, SQL (credencial do workspace), Knowledge Base (stub até Fase 7)
- [ ] Loop agêntico na engine: agente decide → chama tool → observa → responde (máx. N iterações)
- [ ] Node **Agent**: seleciona um agente do workspace e o usa dentro de qualquer workflow
- [ ] Memória: curto prazo (janela da execução) + persistente opcional por agente (chave/valor no Postgres)
- [ ] `POST /chat`: endpoint para conversar com um agente diretamente (base do Copilot da Fase 11)

### 5d — Templates (fecha v1)
- [ ] Schema `templates` + seed com 6–8 templates oficiais do spec (Suporte IA, Responder Email, Extrair PDF, Lead Qualification, Resumo de reuniões, Análise financeira…)
- [ ] Página **Templates**: galeria com preview do grafo + "Usar template" (clona para o workspace)

**Critério de aceite (marco v1 completo):** fluxo `Webhook → Classificador IA (GPT) → If → Agente (Claude) → Email` roda de ponta a ponta; tokens e custo aparecem na execução; template instanciado funciona sem ajustes.

---

## FASE 6 — Executions, Logs e Observabilidade

**Objetivo:** transformar os dados de execução já persistidos em uma experiência de observabilidade completa.

**Entregas:**
- [ ] Página **Executions**: tabela com filtros (workflow, status, período), paginação, busca
- [ ] Detalhe da execução: timeline dos steps, grafo com estados (✔/✖/⏳), input/output por node (JSON viewer), tokens/modelo/custo por node, erro com stack trace
- [ ] Logs em tempo real (SSE) na visualização de execução em andamento
- [ ] Tracing: `trace_id` por execução propagado nos logs; tempo por node; uso de memória do worker
- [ ] **Replay**: re-executar execução (mesmo input), re-executar com input modificado, re-executar **a partir de um node** (partial replay usando outputs persistidos dos steps anteriores); `parent_execution_id` liga replay à original
- [ ] Retry manual de execução falhada direto da lista
- [ ] Dashboard real (substitui mocks da Fase 1): métricas agregadas por período com queries otimizadas + cache Redis
- [ ] Página **Analytics**: tempo médio, tokens, falhas, uso de IA por provider, execuções por dia, fluxos ativos, custos (gráficos)
- [ ] Painel **Custos IA** por provider (OpenAI US$ X, Claude US$ Y…) como no spec

**Critério de aceite:** dado um fluxo que falhou no 3º node, o usuário identifica a causa pelos logs, corrige o input e faz partial replay a partir do node falhado com sucesso.

---

## FASE 7 — Knowledge (RAG)

**Objetivo:** pipeline completo de base de conhecimento utilizável por qualquer agente/node.

**Entregas:**
- [ ] pgvector habilitado; schema `knowledge_bases`, `documents`, `chunks`
- [ ] Upload (`POST /knowledge/upload`): PDF, DOCX, Markdown, TXT, CSV — processado async via BullMQ (fila `ingestion`)
- [ ] Pipeline: extração de texto → chunking (tamanho/overlap configuráveis) → embeddings (provider configurável) → pgvector
- [ ] Status de processamento por documento (processing → ready/failed) com progresso na UI
- [ ] Busca semântica: endpoint de retrieval (top-k + threshold + filtro por metadata)
- [ ] Página **Knowledge**: lista de bases, upload drag & drop, documentos com status, playground de busca ("teste sua base")
- [ ] Tool **Knowledge Base** dos agentes funcionando (retrieval → contexto no prompt)
- [ ] Node **Knowledge Search** para usar retrieval em qualquer workflow

**Critério de aceite:** upload de um PDF → agente de suporte responde pergunta cujo conteúdo só existe no PDF, com trecho-fonte identificável nos logs.

---

## FASE 8 — MCP (Model Context Protocol)

**Objetivo:** integração nativa com MCP — diferencial explícito do spec.

**Entregas:**
- [ ] MCP client em `packages/ai` (SDK oficial): transports stdio, SSE e HTTP
- [ ] Schema `mcp_servers`; `POST /mcp/connect`, disconnect, list
- [ ] Descoberta de tools: ao conectar, listar tools/resources do servidor e persistir catálogo
- [ ] Health check periódico (BullMQ repeatable) + status connected/disconnected/error
- [ ] Página **MCP** (tela exclusiva do spec): lista de servidores com status, adicionar servidor (form por transport), logs de comunicação, tools disponíveis por servidor
- [ ] Tools MCP disponíveis para **agentes** (aparecem no seletor de tools junto às nativas)
- [ ] Node **MCP Tool**: invocar uma tool MCP diretamente num workflow
- [ ] Servidores de exemplo pré-configuráveis: Filesystem, GitHub, Postgres, Browser (como no spec)

**Critério de aceite:** conectar um servidor MCP de filesystem, ver suas tools na UI, e um agente usá-las durante uma execução com logs da chamada MCP.

---

## FASE 9 — Versionamento, Scheduler, Integrações e Marketplace *fecha o marco v2*

**Objetivo:** maturidade de plataforma: histórico de versões, agendamento robusto, mais integrações e ecossistema.

**Entregas:**
- [ ] **Versionamento:** publicar versão (draft → published), lista de versões com diff visual dos grafos (nodes adicionados/removidos/alterados), rollback em um clique; execuções apontam para a versão usada
- [ ] **Scheduler completo:** UI de agendamento (presets minuto/dia/semana/mês + expressão cron com preview das próximas execuções), timezone, habilitar/desabilitar
- [ ] **Busca global `Ctrl+K` real:** fluxos, nodes (dentro dos fluxos), execuções, templates, agentes
- [ ] **Integrações prioritárias** (nodes + triggers + credentials OAuth onde aplicável): GitHub, Stripe, Notion, Google Drive, Linear, WhatsApp (Cloud API), Teams — demais integrações do spec entram por demanda com o mesmo padrão
- [ ] **Marketplace:** schema `marketplace_items`; publicar agente/workflow/prompt/template do workspace (com sanitização de secrets); galeria pública com busca, categorias, downloads e rating; instalar item no workspace
- [ ] Sanitização na publicação: credenciais e variáveis viram placeholders exigidos na instalação

**Critério de aceite (marco v2 completo):** usuário publica um workflow no marketplace; outro usuário instala, configura as próprias credenciais e executa; rollback de versão restaura comportamento anterior comprovado por execução.

---

## FASE 10 — Execução Distribuída e Escala

**Objetivo:** arquitetura v3 — workers separados, concorrência real e resiliência.

**Entregas:**
- [ ] Worker como app separado (`apps/worker`): API publica, workers consomem — deploy independente
- [ ] Múltiplos workers concorrentes; concorrência configurável por fila
- [ ] Filas dedicadas: `executions`, `ai-calls` (rate limit por provider), `ingestion`, `schedules`, `health-checks`
- [ ] Rate limiting e backpressure por provider de IA (respeitar limites de API)
- [ ] Idempotência e recuperação: execução órfã (worker morto) detectada e retomada/failed com consistência
- [ ] Sandbox de nodes: timeout duro, limite de memória, isolamento de código de node (ADR-005)
- [ ] Auto-scaling: métricas de fila (depth, latency) expostas; scaling horizontal no Railway baseado em carga
- [ ] Testes de carga: N execuções simultâneas com P95 documentado
- [ ] Graceful shutdown (drenar jobs antes de encerrar) para deploys sem perda

**Critério de aceite:** matar um worker no meio de 100 execuções simultâneas não perde nem duplica nenhuma execução; segundo worker absorve a fila.

---

## FASE 11 — IA Generativa de Plataforma: Autocomplete, Copilot, Debugger, Optimizer

**Objetivo:** as features "AI First" que definem o produto — a IA operando a própria plataforma.

**Entregas:**
- [ ] **Autocomplete IA (NL → workflow):** input de linguagem natural ("Quando chegar um email com boleto, extraia os dados…") → LLM com structured output gera `graph_json` válido usando o catálogo de nodes → preview no canvas → usuário aceita/edita. Validação: todo grafo gerado passa pelo mesmo validador do editor
- [ ] **Copilot no editor:** painel de chat com contexto do fluxo atual (grafo + últimas execuções); responde "como melhorar este fluxo?", "existe gargalo?", "posso reduzir custos?"; pode propor edições no grafo (diff aplicável com um clique)
- [ ] **AI Debugger:** ao falhar uma execução, análise automática (erro + logs + config do node) → causa provável + sugestões acionáveis (Adicionar Retry / Timeout / Fallback, como no spec) aplicáveis com um clique
- [ ] **AI Cost Optimizer:** análise de histórico de execuções → sugestões "trocar GPT por Gemini neste node" com economia estimada em % baseada nos preços reais do registro de modelos e na qualidade exigida (output schema simples → modelo mais barato)
- [ ] Telemetria das sugestões: aceite/rejeição registrado para melhorar prompts internos

**Critério de aceite:** a frase de exemplo do spec gera um workflow válido e executável; uma execução com timeout HTTP recebe diagnóstico e o fix sugerido aplicado resolve no replay.

---

## FASE 12 — Produção, Polimento e Lançamento *fecha o marco v3*

**Objetivo:** qualidade de produto comercial pronto para produção.

**Entregas:**
- [ ] Deploy produtivo: Vercel (web) + Railway (api, workers, Postgres, Redis) via GitHub Actions com ambientes staging/prod
- [ ] Segurança: rate limiting na API, CORS estrito, headers de segurança, auditoria de dependências, validação de webhooks (assinaturas), rotação de secrets
- [ ] Hardening de auth: verificação de email, reset de senha, sessões, opcional 2FA
- [ ] Observabilidade de infra: logs estruturados agregados, alertas de erro (Sentry ou similar), métricas de sistema
- [ ] Onboarding: primeiro acesso guiado (criar primeiro fluxo a partir de template em < 2 min)
- [ ] Passe final de UX: microinterações, estados vazios, atalhos de teclado, acessibilidade (foco, contraste, ARIA)
- [ ] Performance frontend: code splitting do editor, virtualização de listas grandes, bundle budget
- [ ] Documentação: docs de usuário (nodes, agentes, MCP), docs de API (OpenAPI/Swagger gerado pelo NestJS), guia de criação de nodes custom
- [ ] Voice Workflows (item v3 do spec): protótipo — comando de voz → transcrição → Autocomplete IA (reusa Fase 11)
- [ ] Suite E2E (Playwright) dos fluxos críticos: criar fluxo, executar, replay, publicar no marketplace

**Critério de aceite:** ambiente de produção público, com um usuário novo saindo do registro até a primeira execução bem-sucedida sem ajuda externa.

---

# 5. Dependências entre Fases

```
F0 ──► F1 ──► F2 ──► F3 ──► F4 ──► F5  (marco v1)
                      │              │
                      │              ├──► F6 (observabilidade usa dados de execução)
                      │              ├──► F7 (RAG usa node Embeddings + agentes)
                      │              └──► F8 (MCP pluga em agentes)
                      │
              F6/F7/F8 ──► F9 (marco v2)
                              │
                              ├──► F10 (distribuição)
                              └──► F11 (features IA usam histórico + engine madura)
                                      │
                          F10 + F11 ──► F12 (marco v3 / lançamento)
```

Paralelização possível com mais de uma pessoa: F6, F7 e F8 são independentes entre si após F5; F10 e F11 idem após F9.

---

# 6. Riscos e Mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Engine de execução subestimada (branches, parallel, retry, estado) | Alto | Fase 3 dedicada só ao core da engine; testes de integração com fixtures de grafo desde o início |
| Explosão de escopo de nodes/integrações | Alto | Registry plugável: cada node é isolado e barato de adicionar; priorizar por template/caso de uso, não pela lista completa |
| Custos de IA em dev/teste | Médio | Ollama local como provider default em dev; mocks de provider nos testes; limites de gasto por workspace |
| Divergência de APIs entre providers (tools, structured output) | Médio | Abstração `AIProvider` com testes de contrato por provider; capacidades declaradas por modelo |
| Grafos gerados por IA inválidos (Fase 11) | Médio | Mesmo validador do editor aplicado à saída do LLM + retry com feedback do erro de validação |
| Multi-tenancy adicionada tarde | Alto | Decidido na Fase 2 (ADR-006) — tudo nasce escopado por workspace |
| Segurança de secrets | Alto | Criptografia desde a Fase 2; secrets nunca em logs/exports; sanitização no marketplace |
| pgvector insuficiente em escala | Baixo | Interface de retrieval abstraída; troca por Qdrant/Pinecone sem tocar nos consumidores |

---

# 7. Definição de Pronto (DoD) — válida para toda fase

- Código TypeScript strict, lint e typecheck passando no CI
- Testes: unitários para lógica de engine/nodes/providers; integração para APIs; E2E para fluxos críticos (a partir da F5)
- Migrations versionadas e reversíveis
- Erros tratados com mensagens acionáveis (nunca stack trace cru para o usuário)
- Feature funcional via UI (não apenas via API)
- Sem secrets em código, logs ou fixtures
- Critério de aceite da fase demonstrável de ponta a ponta

---

# 8. Primeiros Passos Imediatos

1. Iniciar repositório git e estrutura do monorepo (Fase 0)
2. Registrar ADR-001 a ADR-007 com as direções da seção 2.3
3. Subir `docker-compose.dev.yml` com Postgres (pgvector) e Redis
4. Bootstrap do Next.js e NestJS com CI verde
5. Instalar shadcn/ui e definir tokens do design system (Fase 1)
