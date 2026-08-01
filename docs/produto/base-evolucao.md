# Base de Evolução do Produto — estado atual, mercado e gaps

Data: 2026-07-28 (atualizado 2026-07-30: discovery aprofundado do H2 — ver
[`discovery-h2.md`](discovery-h2.md)). Este documento cruza três levantamentos feitos no mesmo dia:
inventário completo do código (o que existe de fato), cobertura de testes, e
pesquisa de mercado (n8n/Make/Zapier, Dify/Flowise/Langflow, requisitos
enterprise e o mercado brasileiro de atendimento). É a base para traçar os
próximos passos. O objetivo declarado não é ser a melhor ferramenta do
mercado, e sim **cobrir tudo que o mercado necessita**.

---

## 1. O que temos hoje (feito e funcionando)

Plataforma completa de automação com IA, **em produção** (Railway + Vercel),
multi-tenant, pt-BR/en:

- **47 nodes** em 7 categorias: 4 triggers (manual, webhook, cron, chat),
  9 de lógica (if com regex, switch, parallel, merge, delay, loop de lista,
  variáveis), 11 de IA (chat, extração, classificação, tradução, resumo,
  vision, OCR, embeddings, agente, RAG, MCP), 7 de API/integrações (HTTP
  white-label com HMAC, GraphQL, GitHub, Stripe, Notion, Google Drive,
  Linear), 4 de banco (Postgres, MySQL, MongoDB, Redis), 5 de arquivo (PDF,
  DOCX, CSV, TXT, JSON), 7 de comunicação (Email, Slack, Discord, Telegram,
  Teams, WhatsApp-envio, chat.reply).
- **4 providers de IA** (OpenAI, Anthropic, Gemini, Ollama) com saída
  estruturada, rate limiting distribuído via Redis e telemetria de custo.
- **Agentes** com loop de tools (calculadora, HTTP, SQL, KB, memória) + tools
  MCP; **RAG** com pgvector/HNSW e pipeline de ingestão; **MCP** com 3
  transportes (stdio, SSE, HTTP).
- **Engine** com execução em ondas (paralelismo real), branches, join,
  retry com backoff, sandbox por worker_thread (timeout duro + limite de
  heap), worker separado da API, filas BullMQ, recuperação de órfãs,
  heartbeat, SSE ao vivo.
- **Editor visual** (React Flow) com paleta, config por node, salvar manual
  (Ctrl+S), execução ao vivo, versionamento com diff e rollback.
- **Chat público** por token + **inbox de atendimento humano** — validado
  ponta-a-ponta com o fluxo real "Vendas via Chat" (integração Rein ERP).
- **IA de plataforma**: autocomplete de grafo, Copilot, AI Debugger, Cost
  Optimizer, com telemetria de aceite/rejeição.
- **Observabilidade**: 15 métricas Prometheus, logs correlacionados
  (requestId/executionId), Grafana local, analytics de custo por provider.
- **261 testes E2E** (Playwright) cobrindo auth, editor, execuções, agents,
  knowledge, MCP, chat, settings, platform-AI.

## 2. O que o mercado exige (baseline 2026)

Da pesquisa (fontes no rodapé), o que aparece como **esperado** — não
diferencial — em cada segmento:

**Automação geral (n8n/Make/Zapier):** centenas de integrações com OAuth
"clicou-conectou"; node de código (JS/Python); sub-workflows; error handling
configurável (continue-on-error, error workflow, fallback); human-in-the-loop
(aprovações); templates e community nodes; agent builder nativo. n8n 2.0
consolidou LangChain nativo com ~70 nodes de IA e memória persistente.

**Plataformas LLM (Dify/Flowise/Langflow):** RAG com hybrid search;
observabilidade LLM (traces por step, custo e latência por chamada, export
OpenTelemetry/Langfuse); gestão de prompts; publicar fluxo como API; suporte
multi-modelo com fallback entre providers.

**Enterprise:** RBAC granular, SSO/SAML, audit log imutável, SOC 2/GDPR,
alerting configurável (email/Slack/PagerDuty), dashboards de custo e latência.

**Brasil/PME (nosso mercado de entrada):** WhatsApp é O canal — 88% dos
brasileiros preferem mensagem para falar com empresa, 68% das PMEs já usam
IA no WhatsApp. O modelo vencedor: bot resolve 70-80%, transfere os 20-30%
para humano **com contexto da conversa**. Multi-atendente, horário 24/7,
qualificação de leads.

**Leitura estratégica:** nossa arquitetura já está no quadrante certo
(self-hosted possível, IA nativa, chat+inbox humano embutido — que n8n/Make
não têm). O gap não é de arquitetura, é de **completude e maturidade**.

## 3. Gaps — o que corrigir, completar, refinar e validar

### 3.1 CORRIGIR — coisas que existem mas estão quebradas/enganosas

| # | Item | Evidência | Status |
|---|---|---|---|
| C1 | **Tool calling silenciosamente ausente em Gemini e Ollama** — agente configurado com esses providers recebe as tools mas nunca consegue chamá-las, sem erro nem aviso | `packages/ai/src/providers/gemini.ts:58`, `ollama.ts:52` (`toolCalls: []` hardcoded) | ✅ Corrigido (`e2a3fcb`) |
| C2 | **Catálogo de modelos/preços fictício** alimentando custo real (`execution.cost_usd`) e as recomendações do Cost Optimizer | `packages/ai/src/models.ts` | ✅ Corrigido (`e2a3fcb`) |
| C3 | **AI Debugger sugere `fallback` que não pode ser aplicado** — engine é fail-fast, não tem mecanismo de fallback | `debugger.service.ts:61-65` | ✅ Corrigido (`e2a3fcb`) — node ganhou `onError:'branch'` |
| C4 | **Replay parcial perde `$vars`** acumuladas antes do ponto de replay | `engine.service.ts:176-179` | ✅ Corrigido — `varsPatch` persistido por step e reconstituído no replay parcial. Limitação nova, documentada no código: para execuções de chat, `conversationId`/`state` do replay parcial só ficam corretos se o node de partida ainda carregar o payload do chat (verdade logo após o trigger; falso abaixo de um node como `ai.extraction`, que retorna resultado próprio) |
| C5 | **`GET /templates` sem WorkspaceGuard** (menor, mas é inconsistência de auth) | `templates.controller.ts` | ✅ Corrigido — não era vulnerabilidade (JWT global já protegia; `Template` não tem `workspace_id`), mas a exceção só vivia num comentário de teste. `WorkspaceGuard` aplicado ao controller e decisão registrada no ADR-006 |
| C6 | **`docker/` vazia** contradizendo o README; **sem `vercel.json`** — config do deploy web vive fora do repo | raiz do repo | ✅ Corrigido — `docker/` era rastro da Fase 0 nunca populado (Dockerfile real é `apps/api/Dockerfile` desde a Fase 10, em produção via Railway); pasta removida e README/plan.md corrigidos. `apps/web/vercel.json` mínimo criado (fixa `framework`); Root Directory e env vars continuam fora do repo por não serem versionáveis, documentado em `docs/deploy/vercel.md` |

### 3.2 COMPLETAR — features que o mercado trata como básicas e não temos

Em ordem de impacto para o posicionamento (WhatsApp/PME primeiro):

1. **WhatsApp como canal de conversa** (Cloud API oficial Meta) — já decidido
   e documentado em `docs/integracoes/whatsapp.md`. O ponto de extensão
   existe (`conversation.channel`, comentado na engine); falta o trigger, o
   webhook e o envio pela Graph API. É o gap nº 1 para o mercado brasileiro.
2. **Error handling configurável na engine** — *parcialmente entregue*
   (constatado no discovery de 2026-07-30): caminho de erro genérico por
   node (`onError:'branch'` + edge `error`, saído da correção C3) e retry
   com backoff por node já existem ponta a ponta (engine + UI + testes).
   Falta: continue-on-error (exige terceiro estado de execução), error
   workflow e fallback declarativo (inclusive entre providers de IA), além
   de endurecer o `logic.merge` alimentado por edge de erro (deadlock
   silencioso → execução `success` incompleta). Ver
   [`discovery-h2.md`](discovery-h2.md) §2.
3. **Node de código (JS)** — rodar código do usuário no sandbox que já
   existe (worker_thread com timeout/heap limit já resolvem o isolamento).
   Toda concorrente tem; é a válvula de escape universal.
4. **Sub-workflows** — chamar um fluxo de dentro de outro. Essencial para
   reuso quando os clientes passam de 3-4 fluxos.
5. **OAuth para integrações** — hoje conexões são chave/campos manuais.
   Google/Notion/Slack via OAuth "clicou-conectou" é o esperado. Começar
   pelos providers que já temos como node.
6. **Human-in-the-loop (aprovação)** — pausar execução até aprovação humana
   (o inbox de chat já é meio caminho conceitual; falta o node de aprovação
   genérico com timeout).
7. **Alerting de falhas** — notificar (email/Slack/WhatsApp) quando execução
   falha. Temos toda a infra (nodes de comunicação + eventos de execução);
   falta ligar as pontas.
8. **Publicar fluxo como API** — endpoint estável por fluxo com API key
   (o webhook já existe; falta autenticação por chave e docs). Padrão Dify.
9. **RBAC básico + audit log** — papéis além de member (viewer/editor/admin)
   e trilha de quem alterou o quê. Pré-requisito para contas com equipe
   (multi-atendente já é realidade no inbox).
10. **Hardening de produção (FASE 12 do plan.md, quase toda aberta)** — rate
    limiting na API, helmet/headers, verificação de e-mail, reset de senha,
    Sentry (ou similar), Swagger/OpenAPI, onboarding guiado.

### 3.3 REFINAR — existe, mas abaixo do nível competitivo

- **Templates**: só 7 seedados, sem CRUD pelo usuário. Mercado espera galeria
  rica + salvar fluxo como template. (Marketplace público completo do spec
  pode esperar — ver §4.)
- **Conexões MCP em memória por processo** — API e worker divergem;
  reconectar pela API não afeta o worker. Mover estado para Redis/DB.
- **Embeddings Gemini sem batch** (1 request por texto) e custo zerado em
  Gemini/Ollama — ingestão de KB grande fica lenta e sem contabilização.
- **Chunking de RAG por caracteres** sem tokenizer, sem hybrid search —
  funcional, mas abaixo do baseline Dify.
- **Cost Optimizer estima por preço médio** porque `ExecutionStep` não separa
  tokens de entrada/saída — gravar os dois destrava precisão.
- **ADRs defasados/faltantes**: ADR-007 não cobre `kind: fields`; não há ADR
  do chat público nem da decisão "salvar manual".
- **`plan.md` morto como tracker** (124 checkboxes vazios com ~11 fases
  entregues) — este documento passa a ser a referência; atualizar ou
  aposentar o plan.md.

### 3.4 VALIDAR E TESTAR — onde a confiança real é menor do que parece

- **`pnpm test` no CI é verde por vacuidade** — o único teste unitário é o
  scaffold do Nest. Engine (756 linhas), sandbox, expressões, crypto
  (AES-256-GCM), rate limiter e os 47 `execute()` não têm nenhum teste
  unitário. Prioridade: engine e expressões (fixture de grafo → asserts),
  crypto, rate-limiter.
- **E2E não roda no CI** (exige Postgres/Redis/API/Web reais) — montar job de
  CI com serviços para pelo menos um subconjunto smoke.
- **Zero cobertura E2E** para: nodes de banco (4), comunicação (6),
  integrações (6), arquivos (5), engine nodes (parallel/merge/delay/loop/
  switch-execução), webhook trigger dedicado, providers Gemini/Ollama.
- **Load test defasado** (`docs/perf/fase-10-load-test.md` é de 24/07,
  anterior às mudanças de engine/nodes) — reexecutar após mudanças grandes.
- **Roteiros manuais faltantes**: fases 12 (Chat), 13 (HTTP white-label) e
  14 (conexões multi-campo) previstos no plano de testes e não escritos.

## 4. O que deliberadamente NÃO priorizar agora

- **Marketplace público** (FASE 9) — grande, sem demanda validada; galeria de
  templates interna cobre 80% do valor.
- **Voice Workflows, 2FA/TOTP, SSO/SAML, SOC 2** — relevantes só quando
  houver clientes enterprise pedindo.
- **Competir em número de integrações** com Zapier (8.000 apps) — nosso
  HTTP white-label + code node + MCP cobrem a cauda longa; integrações
  dedicadas entram por demanda de cliente, como foi com a Rein.

## 5. Sequência sugerida (3 horizontes)

**H1 — Confiável e vendável ✅ concluído (2026-07-30):**
correções C1-C6 ✅ · hardening HTTP ✅ (rate limit, helmet, CORS) · testes
unitários de engine/expressões/crypto ✅ (59 testes) · e2e smoke no CI ✅ ·
Sentry ✅ · reset de senha ✅ · alerting de falhas ✅.
*Critério: dá pra colocar cliente pagante sem sustos.*
Plano faseado com checklist completo (incluindo pendências que ficam pro
usuário — configurar Sentry/env vars reais em produção, acompanhar o
primeiro run do `e2e-smoke` no GitHub Actions): [`plano-h1.md`](plano-h1.md).

**H2 — Competitivo no caso de uso âncora (em seguida):**
WhatsApp Cloud API como canal · error handling configurável · node de código
· aprovação humana · publicar fluxo como API · templates CRUD. *Critério: o
"Vendas via Chat" vira produto replicável para qualquer PME brasileira.*
Discovery aprofundado dos seis temas (2026-07-30), com mapa "já existe /
falta construir", bugs encontrados de passagem e ordem sugerida de execução:
[`discovery-h2.md`](discovery-h2.md). Item 1 da ordem (correções baratas de
passagem) especificado em
[`spec-h2-01-correcoes-passagem.md`](spec-h2-01-correcoes-passagem.md).

**H3 — Pronto para equipe e escala:**
sub-workflows · OAuth nas integrações · RBAC + audit · RAG hybrid search +
tokenizer · MCP estado compartilhado · Swagger + docs públicas + onboarding.
*Critério: contas com múltiplos usuários e dezenas de fluxos.*

---

### Fontes da pesquisa de mercado (2026-07)

- [Zapier vs Make vs n8n 2026 — Digital Applied](https://www.digitalapplied.com/blog/zapier-vs-make-vs-n8n-2026-automation-comparison)
- [n8n vs Make vs Zapier — Digidop](https://www.digidop.com/blog/n8n-vs-make-vs-zapier)
- [n8n Guide 2026 — HatchWorks](https://hatchworks.com/blog/ai-agents/n8n-guide/)
- [n8n Features 2026 — LOW/CODE](https://www.lowcode.agency/blog/n8n-features)
- [Dify vs Langflow vs Flowise — Elestio](https://blog.elest.io/dify-vs-langflow-vs-flowise-which-open-source-llm-app-builder-actually-ships-to-production/)
- [Dify vs Flowise vs Langflow 2026 — Cedar Ops](https://cedarops.com/blog/dify-vs-flowise-vs-langflow/)
- [Enterprise AI Automation Platforms 2026 — Vellum](https://www.vellum.ai/blog/guide-to-enterprise-ai-automation-platforms)
- [Best Workflow Automation Tools 2026 — Kestra](https://kestra.io/resources/infrastructure/best-workflow-automation-tools)
- [WhatsApp para Pequenas Empresas 2026 — SocialHub](https://www.socialhub.pro/blog/whatsapp-para-pequenas-empresas-2026/)
- [Ferramentas de IA para atendimento no WhatsApp — Algoritmo Diário](https://algoritmodiario.com/artigos/ferramentas-ia-atendimento-whatsapp-pme.php)
