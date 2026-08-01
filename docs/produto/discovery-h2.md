# Discovery H2 — mapa "já existe / falta construir" dos seis temas

Data: 2026-07-30. Discovery aprofundado dos seis temas do horizonte H2 de
[`base-evolucao.md`](base-evolucao.md) (§5), feito por seis investigações
paralelas somente-leitura sobre o código atual. Cada afirmação carrega
evidência `arquivo:linha`. Nada foi alterado durante o levantamento.

Temas: WhatsApp Cloud API como canal · error handling configurável · node de
código · aprovação humana · publicar fluxo como API · templates CRUD.

---

## Leitura executiva

O `base-evolucao.md` acertou na direção, mas errou em três avaliações:

1. **"Error handling configurável" está mais pronto do que o doc diz** —
   error branch genérico (`onError:'branch'` em qualquer node) e retry com
   backoff por node já existem ponta a ponta (engine + UI + testes). O que
   falta é outra coisa: continue-on-error, error workflow e fallback
   declarativo.
2. **"O sandbox já resolve o isolamento" do node de código é falso** — o
   próprio ADR-005 admite que worker_thread não é sandbox de segurança
   (`docs/adr/005-isolamento-execucao-nodes.md:43-46`). O worker recebe
   `process.env` completo (incluindo `SECRETS_ENCRYPTION_KEY` e
   `DATABASE_URL`): código de usuário hoje = comprometimento cross-tenant.
   Endurecimento é pré-requisito bloqueante, não detalhe.
3. **Aprovação humana é o item mais caro do H2, não um "meio caminho"** — a
   engine roda cada execução inteira em memória num único job BullMQ, sem
   estado "pausado"; o replay parcial resolve ~70% da retomada mas descarta
   branches paralelas pendentes.

Esforço relativo (menor → maior): **templates CRUD < publicar como API <
WhatsApp < node de código < continue-on-error/error workflow < aprovação
humana**.

---

## 1. WhatsApp Cloud API como canal

**Veredicto: a fundação foi deliberadamente preparada — trabalho grande, trilha clara.**

Decisões já registradas em `docs/integracoes/whatsapp.md`: Cloud API oficial
direto (sem BSP), Evolution/Baileys descartadas (risco de ban), arquitetura
espelhando o `trigger.chat`, credential multi-campo
(access token + phone_number_id + verify_token), validação em sandbox antes
de número real. Ficou aberto no doc: janela de 24h, HSM, mídia, idempotência,
assinatura `X-Hub-Signature-256` (nem citada).

### Já existe

| Peça | Onde |
|---|---|
| `channel` string livre, novo canal **sem migration** (decisão comentada no schema) | `apps/api/prisma/schema.prisma:557-565` |
| Chave natural conversa↔contato: `@@unique([workflowId, channel, externalKey])` | `schema.prisma:580` |
| Estado conversacional persistente (`Conversation.state` ↔ `$vars`) | `schema.prisma:571-572`; `engine.service.ts:169-172, 373-381` |
| Histórico (10 últimas) injetado no fluxo | `apps/api/src/chat/chat.service.ts:11, 104` |
| Ponto único de saída de mensagem do bot, com o TODO do switch por canal | `apps/api/src/engine/engine.service.ts:702-723` |
| Node `chat.reply` + RPC `sendChatMessage` atravessando o sandbox | `packages/nodes/src/definitions/chat-reply.ts`; `engine.service.ts:590-596` |
| **Envio de texto pela Graph API v21** (`integration.whatsapp`) | `packages/nodes/src/definitions/whatsapp-send-message.ts` |
| Inbox humano (listar/ler/responder sem disparar fluxo) | `apps/api/src/chat/chat-inbox.controller.ts`; `chat.service.ts:164-180` |
| Geração idempotente de tokens por node no save (padrão a copiar) | `apps/api/src/workflows/workflows.service.ts:19-86` |
| Cofre AES-256-GCM + credencial multi-campo (`$auth.<chave>`) | `apps/api/src/crypto/crypto.service.ts`; `credentials.service.ts`; `schema.prisma:154-185` |

### Falta construir (itens estruturais)

1. **Node `trigger.whatsapp`** — não existe; criar definição + registro +
   painel + i18n, com token/rota estável via `ensureWhatsappToken` espelhado
   em coluna `@unique` (padrão `workflows.service.ts:19-47`).
2. **GET de verificação da Meta** (`hub.challenge`) — `hooks.controller.ts`
   só tem `@Post`, sem nenhuma verificação (`apps/api/src/hooks/hooks.controller.ts:5-14`).
3. **Validação de `X-Hub-Signature-256`** — exige corpo cru byte-a-byte;
   `apps/api/src/main.ts` não habilita `rawBody`. Mudança obrigatória no
   bootstrap (ou middleware `express.json({ verify })` na rota da Meta).
4. **Parser do payload da Meta + 200 imediato** (a Meta re-entrega em
   timeout; o handler atual devolve o objeto Execution).
5. **Idempotência** — a Meta reenvia webhooks; não há coluna para `wamid` em
   `ConversationMessage` (`schema.prisma:585-599`) nem dedup via Redis.
6. **Upsert de conversa por `wa_id`** (`channel:'whatsapp'` +
   `externalKey`) e **mapeamento `phone_number_id` → workflow** (não há
   coluna/índice; `chat.service.ts:70` é o único create e é hardcoded `'web'`).
7. **Switch de canal em `appendBotMessage`** (`engine.service.ts:709`) — hoje
   não carrega a Conversation nem recebe `channel`. Sem isso, `chat.reply`
   num fluxo WhatsApp grava no banco e o cliente **nunca recebe**.
8. **Janela de 24h** — nenhum controle (sem timestamp da última mensagem do
   cliente, sem fallback para template, sem tratamento dos erros 131047/470;
   `whatsapp-send-message.ts:40-42` é genérico).
9. **Templates HSM** — inexistentes (envio, armazenamento, aprovação, variáveis).
10. **Mídia** — inexistente nas duas direções; `ConversationMessage.content`
    é `String` puro, sem tipo/mime/URL.
11. **Credencial `whatsapp` multi-campo** — o node atual espera token puro
    (`whatsapp-send-message.ts:22`); webhook precisa resolver
    `verifyToken`/`appSecret` fora do contexto de node (não há caminho hoje).
12. **Handoff real** — `Conversation.status` nunca é escrito (writes:
    `engine.service.ts:377,718`, `chat.service.ts:69,110,175`); bot e humano
    respondem juntos. No WhatsApp isso é inaceitável.
13. **Status de entrega/leitura** (`statuses[]` do webhook) — sem modelo nem UI.
14. `TriggerType` é enum fechado (`schema.prisma:239-245`) — reusar `chat` ou
    migration para `whatsapp`.
15. **Testes** — zero cobertura do webhook/chat público em unit; GET de
    verificação e assinatura são candidatos naturais.

## 2. Error handling configurável

**Veredicto: metade do item já foi entregue sem o doc registrar.**

### Já existe (completo ponta a ponta)

- **Error branch genérico**: campo cross-cutting `onError?: 'fail'|'branch'`
  no `WorkflowNode` (`packages/shared/src/graph.ts:24-29`), não por node.
  Engine: guarda em `engine.service.ts:285-309`, roteamento por
  `sourceHandle === 'error'` em `:322-355`; sem edge `error` conectada →
  fail-fast normal (decisão deliberada). Zod `graph.schema.ts:28`; diff de
  versão `graph-diff.ts:26`; UI: `config-panel.tsx:1107-1131`
  (`ErrorPathSection`) + handle vermelho injetado em
  `workflow-node.tsx:118,133-139`; limpeza de edges órfãs no cliente
  (`flow-editor.tsx:256-272`); AI Debugger aplica como patch
  (`debugger.service.ts:311-314`). Testes: `engine.service.spec.ts:449-511`
  + `apps/e2e/tests/logic/error-branch.spec.ts`.
- **Retry com backoff por node**: `node.retry { attempts 1..10, backoffMs }`
  (`graph.ts:10-13`; `graph.schema.ts:15-18`), loop em
  `engine.service.ts:526-531`, backoff linear `:672-676`, UI
  `config-panel.tsx:1055-1105` (default `{attempts:3, backoffMs:1000}`).
- Semântica atual do fail-fast: erros nunca escapam como `throw` — viram
  `NodeStepResult{ok:false}` (3 fontes: `engine.service.ts:469-482`,
  `:502-525`, `:648-670`); `break` da execução em `:312-320`; irmãos da
  mesma onda terminam mas descendentes não são enfileirados; status final
  só `success|failed` (`:175`).
- O padrão de extensão está provado: campo novo de error handling toca 6
  lugares conhecidos (graph.ts, graph.schema.ts, graph-diff.ts,
  engine.service.ts, config-panel.tsx, flow-editor.tsx).

### Falta construir

1. **Continue-on-error** — ✅ **concluído (2026-07-31)**. `onError:'continue'`
   segue pelas edges normais com `{error}` no payload, sem exigir terceiro
   estado de execução (decisão: manter `success`, badge "tratada" derivado
   na UI). Ver [`spec-h2-05`](spec-h2-05-continue-on-error-error-workflow.md).
2. **Error workflow** — ✅ **concluído (2026-07-31)**. `Workflow.errorWorkflowId`
   (ponteiro por fluxo, não bus de eventos) + `TriggerType.event` + guarda
   anti-recursão por triggerType. Ver spec-h2-05.
3. **Fallback declarativo** — só existe "na marra" via error branch manual;
   nenhum fallback entre providers de IA (gap `base-evolucao.md:60`).
   Continua fora de escopo do H2 (registrado no spec-h2-05).
4. **Endurecimento do que existe**:
   - ✅ `logic.merge` alimentado por edge de erro (ou if/switch) entrava em
     **deadlock silencioso** — corrigido com flush parcial (spec-h2-05).
   - Node de tratamento de erro compartilhado roda só 1× (`:246,340`).
   - ✅ Validação server-side de edge `error` órfã — adicionada no
     `superRefine` de `graph.schema.ts` (spec-h2-05).
   - Falhas tratadas por `onError:'branch'`/`'continue'` continuam
     **invisíveis ao alerting** (só dispara com `overallStatus === 'failed'`)
     — by design, mantido: falha tratada não é incidente.
   - ✅ String mágica `'error'` — agora `ERROR_HANDLE` compartilhado
     (`packages/shared/src/graph.ts`).
   - Replay não reaproveita falha tratada (`engine.service.ts:209-223`) —
     limitação conhecida, mantida.

## 3. Node de código (JS)

**Veredicto: viável, mas o isolamento é pré-requisito bloqueante.**

### Já existe (aproveitável sem tocar)

- Worker_thread por node com timeout duro (30s, `NODE_SANDBOX_TIMEOUT_MS`,
  `engine.service.ts:22`) via `worker.terminate()`
  (`node-sandbox-runner.ts:82-89`) e limite de heap (256MB,
  `resourceLimits`, `:62-68`), com `failureReason` timeout/oom e métrica.
- RPC com tenant fixado no host: `workspaceId` nunca cruza para o worker;
  7 métodos (`sandbox-messages.ts:9-16`; closures em
  `engine.service.ts:550-597`).
- `ctx.log` estruturado → `execution_logs` + SSE + UI ao vivo
  (`engine.service.ts:810-847`; `executions/[id]/page.tsx:442-462`).
- Contrato `NodeExecutionResult { output, branches?, varsPatch?, usage? }` e
  validação zod do config **dentro** do worker (`node-worker-entry.ts:92-101`).
- Expressões `{{ }}` são mecanismo separado, sem eval, no thread principal
  (`packages/nodes/src/expressions.ts`) — a pobreza delas (sem operadores,
  sem funções) é justamente o motivo do node de código.
- Retry, error branch, presets e o fallback JSON do painel
  (`config-panel.tsx:1017-1053`) herdados de graça.

### Bloqueantes de segurança confirmados

1. **`process.env` completo no worker** — inclui `SECRETS_ENCRYPTION_KEY`
   (`crypto.service.ts:21`) e `DATABASE_URL`: com os dois, decifra-se as
   credenciais de **todos** os workspaces. Não há `env:` no construtor do
   Worker (`node-sandbox-runner.ts:60-69`). Correção de 1 linha (`env: {}`).
2. **Loader completo** — `require('fs'|'child_process'|'net')` livre. Nada
   de `isolated-vm`/`vm2`/permission model no repo (0 hits no lockfile).
3. **SSRF** — `fetch` sem allowlist nem bloqueio de IP privado/link-local
   (só `new URL()` em `http-request.ts:73`); metadata endpoints e rede
   privada Railway alcançáveis.
4. **CPU spinning** até o timeout, sem teto de threads simultâneas
   (`EXECUTIONS_CONCURRENCY=5` × ondas em `Promise.all` = N threads).
5. Memória externa (`Buffer`/`ArrayBuffer`) fora do `resourceLimits`;
   `process.kill(process.pid)` compartilhado; sem quota nos RPCs; sem cap de
   tamanho de `output` nem de linhas de log; ReDoS já presente hoje
   (`if.ts:36-42` compila regex do usuário).

### Falta construir

- Endurecimento (ordem de retorno): (a) `env: {}`; (b) `node:vm` com globals
  em lista branca (sem `require`/`process`) ou permission model via
  `execArgv`; (c) wrapper anti-SSRF no `fetch`; (d) timeout dedicado curto +
  semáforo global de worker_threads; (e) teste de integração com worker
  **real** (o spec atual mocka `node:worker_threads`).
- Contrato de produto: recomendação = **objeto único clonável** (código
  recebe `$input`/`$vars`, `return` vira `output`), não o modelo "items" do
  n8n (não existe convenção de items no repo — cada node tem shape próprio).
  Decidir escrita em `$vars` (expor mutável e derivar `varsPatch` por diff)
  e `branches`.
- Shim de `console.log` → `ctx.log` com cap de linhas/bytes (cada log é um
  INSERT + evento SSE).
- UI: não existe editor com highlight no monorepo (0 hits de
  Monaco/CodeMirror/Shiki). v1 = `<Textarea className="font-mono">` dedicada
  no padrão do body HTTP (`config-panel.tsx:242-250`); CodeMirror 6 é a
  opção rica. Node nasce com split `.meta.ts`/`.ts`
  (padrão `http-request.meta.ts:3-13`); categoria: `logic.code` evita mexer
  na union fechada de categorias.

## 4. Aprovação humana (human-in-the-loop)

**Veredicto: o único item que exige mexer no coração da engine.**

### O problema estrutural

- 1 job BullMQ = 1 execução inteira (`executions.processor.ts:37-46`),
  concorrência 5 por worker. Todo o frontier do grafo vive em variáveis
  locais de `run()`: `nodeOutputs`/`vars` (`engine.service.ts:169-170`),
  `executed`/`mergeBuffers` (`:190-191`), `currentWave`/`nextWave`
  (`:232-239,322,356`). Nada disso toca o banco durante a execução.
- Sem estado pausado: `ExecutionStatus { queued running success failed canceled }`
  (`schema.prisma:231-237`); todo caminho de saída grava success/failed
  (`engine.service.ts:360-371`).
- **Orphan recovery mata execução `running` há mais de 10 min** no boot de
  todo worker (`orphan-recovery.service.ts:8-10,38-64`).
- "Esperar dentro do node" é inviável: o sandbox mata qualquer node em 30s —
  prova disso é o bug atual do `logic.delay` (config aceita 300s,
  `delay.ts:5`, falha sempre acima de 30s).
- Chat hoje **não é pausa**: cada mensagem do visitante dispara uma execução
  nova e completa, com estado externalizado em `Conversation.state`
  (re-trigger stateless). A resposta do operador **não** dispara nada
  (`chat.service.ts:163-180`).

### Já existe (reaproveitável)

- **Replay parcial** (`engine.service.ts:204-239` + `computeAncestors`
  `:683-700`): reconstrói outputs + `$vars` (via `varsPatch` por step) do
  Postgres e arranca o grafo de um node arbitrário — ~70% da retomada.
  Limites: cria Execution nova (não retoma a mesma), só sobe pelos
  ancestrais (descarta branches paralelas pendentes), só steps `success`.
- `PasswordResetToken` como molde do token de decisão: raw só no link, hash
  sha256 `@unique`, TTL, uso único transacional (`auth.service.ts:105-171`;
  `schema.prisma:36-47`).
- Inbox como esqueleto de UI de pendências (`inbox-view.tsx`); tokens
  públicos longos-vivos com rate limit (padrão chat).
- `AlertsService` + `MailerService` para notificar aprovador com link
  (`alerts.service.ts:44-116`); nodes de canal (Slack/Email/etc.).
- `SCHEDULES_QUEUE` disponível para o delayed job de timeout
  (`queue.module.ts:31`) — BullMQ delayed jobs ainda não são usados em
  lugar nenhum do repo.

### Falta construir

Tudo abaixo — ✅ **concluído (2026-08-01)**. Ver
[`spec-h2-06`](spec-h2-06-aprovacao-humana.md) e
[`ADR-011`](../adr/011-pausa-duravel.md).

1. ✅ **Pausa durável**: status `waiting_approval` (+ `EXECUTION_PHASE`
   exaustivo em `packages/shared/src/execution.ts`, não um espelho manual),
   isento do orphan recovery (filtra por `runStartedAt`, não `startedAt`);
   frontier persistido em tabela própria (`ExecutionPausedState`), não nas
   variáveis locais de `run()`; caminho de saída do `while`
   ("drenar-e-pausar") sem gravar success/failed.
2. ✅ Sinal genérico `suspend?: SuspendDescriptor` no contrato do node — a
   engine nunca interpreta "é uma aprovação", só sabe suspender/retomar.
3. ✅ Tabela `Approval` — igual ao previsto, mais `resumeEnqueuedAt`/
   `resumeAttempts` (cobre o worker morrer entre decidir e enfileirar) e
   `@@unique([executionId, nodeId])` (fecha a janela de retry do sandbox).
4. ✅ Endpoints — `POST /approve/:token/decide` público (não
   `/public/approvals/:token/...` como cogitado aqui: seguiu o padrão de
   rota de `/chat/[token]`) + `GET /approvals` e
   `POST /approvals/:id/(approve|reject)` autenticados.
5. **Decisão revista**: sweeper **repeatable**, não delayed job na
   `SCHEDULES_QUEUE` — o repo não tinha nenhum precedente de delayed job, e
   cancelar+recriar ao decidir cedo era mais código que um sweeper simples
   com o Postgres como fonte da verdade. Ver ADR-011.
6. ✅ Node `approval.human` + painel + i18n + página `/approvals`
   (autenticada) + página pública `/approve/[token]` (molde reset-password
   pro card de estado, mas GET real de status + POST de decisão em vez do
   form single-shot do reset).

## 5. Publicar fluxo como API

**Veredicto: a URL estável existe; todo o resto falta.**

### Estado atual

- `POST /hooks/:webhookId` (`hooks.controller.ts:5-14`): público, sem
  autenticação além do UUID na URL, sem verificação, devolve o objeto
  Execution com status `queued` (201). 100% assíncrono: a engine só existe
  no `WorkerModule` (`worker/worker.module.ts:29`) — o processo da API nem a
  instancia; `EngineService.run()` é `Promise<void>`.
- **Não existe API key no repo** (grep por apiKey só acha chaves de provider
  de IA em Credential); nenhum `timingSafeEqual`.
- O endpoint aponta cegamente para `currentVersionId`
  (`executions.service.ts:58`) — **todo Ctrl+S muda a API pública na hora**
  (cada save cria versão e move o ponteiro; "publicar"/rollback são a mesma
  operação, `workflows.service.ts:239-242`).
- **Não checa `workflow.status`**: fluxo `draft`/`archived` continua
  disparando por webhook (e chat). Só o cron é desligado ao arquivar
  (`workflows.service.ts:143-155`).
- `lastOutput` como "resultado" é não determinístico com fan-out
  (`engine.service.ts:174,279,367` — último item do último for da última
  onda). Não existe node "respond to webhook".
- Rate limit: global por IP (Throttler, 100/min prod) + camadas em memória
  no chat/telemetry. **Nenhum limite por chave/identidade.**
- Swagger/OpenAPI: confirmado ausente (`apps/api/package.json`, `main.ts`).

### Falta construir

1. **API key por fluxo**: model `WorkflowApiKey` (workflowId,
   `keyHash @unique`, `lastFour`, `name`, `revokedAt`, `lastUsedAt`) no
   molde do `PasswordResetToken`; CRUD; guard novo (o `WorkspaceGuard`
   exige `request.user` — não serve); `timingSafeEqual`.
2. **Gating por status + versão**: bloquear archived; opcionalmente permitir
   pinar versão publicada ≠ versão de edição (decisão de produto).
3. **Modo síncrono sem mover a engine**: enfileira + aguarda o evento
   `execution.completed` que `ExecutionEventsService.toObservable` já emite
   via Redis pub/sub (`execution-events.service.ts:117-135`), com timeout.
4. **Node `respond`** para resultado determinístico.
5. **Rate limit por chave** (ThrottlerGuard customizado com `getTracker()`
   pela chave, ou limiter Redis).
6. **Docs do endpoint** (Swagger ou página própria).

## 6. Templates CRUD

**Veredicto: o item mais barato — decisão de arquitetura já tomada no ADR-006.**

### Estado atual

- Model mínimo de 6 colunas, sem `workspaceId`/autor/preview/tags
  (`schema.prisma:361-370`); única migração é a de criação
  (`20260724010000_templates`).
- Rotas: só `GET /templates` e `POST /templates/:id/use`
  (`templates.controller.ts:21-33`); `dto/` vazio; sem GET por id, POST,
  PATCH, DELETE. `WorkspaceGuard` aplicado (C5).
- `use()` (`templates.service.ts:14-49`): copia o grafo **literalmente** —
  sem sanitização, **sem validação** com `workflowGraphSchema`, e **sem
  `ensureChatTokens`** (só `ensureWebhookId`; compare
  `workflows.service.ts:187-188`). Template com `trigger.chat` gera fluxo
  com chat público quebrado (lookup é pela coluna, que fica nula).
- 7 seeds em TypeScript (`seed.ts:47-269`), id = slug do nome (o i18n do
  front depende disso); credenciais referenciadas **por nome**
  (`anthropic-default`) — convenção, falha em runtime se o workspace não
  tiver; seeds contornam o `@unique` de `webhookId` gravando `''`.
- Galeria: grid estática, sem busca/filtro/paginação; "preview" = chips de
  `node.label`; botão "Usar template"
  (`apps/web/src/app/(app)/templates/page.tsx`).
- Não existe exportar/duplicar fluxo em lugar nenhum — mas
  `GET /workflows/:id/versions/:versionId` já devolve o grafo de qualquer
  versão (endpoint natural para "salvar como template"), e `NodePreset`
  (`schema.prisma:214-229` + `node-presets/*`) é o molde quase exato de CRUD
  por workspace com payload JSON.
- ADR-006 (`docs/adr/006-multi-tenancy.md:22-28`) **já prescreve** a
  evolução: `workspace_id` nullable (null = catálogo global seedado),
  listagem = globais + do workspace. Marketplace/`is_public` fora de escopo
  (`base-evolucao.md` §4).

### Falta construir

1. **Criar template a partir de fluxo** (rota + entrada de menu no editor ou
   em /flows) com **sanitização obrigatória** do grafo: zerar
   `config.credential`, `agentId`, `knowledgeBaseId`, `signature.secret` e
   `headers` do HTTP, e `webhookId`/`chatToken`/`inboxToken` — sem zerar
   `webhookId`, a 2ª instanciação estoura P2002 (o `ensureWebhookId`
   preserva valor existente, `workflows.service.ts:33-35`).
2. **Editar/deletar** (restrito ao workspace dono; template global
   read-only). RBAC por papel ainda não existe (`workspaceRole` é populado
   pelo guard mas nunca consumido).
3. **Migração**: `workspace_id String?` + índice; `list()` com
   `OR: [{workspaceId: null}, {workspaceId}]`.
4. **Galeria**: filtro por categoria + busca (`?category=`/`?q=` no GET) e
   UI correspondente. Atenção: o e2e `templates.spec.ts:66-68` exige que o
   `list()` continue devolvendo `graph.nodes` (contrato do preview).
5. Corrigir os bugs do `use()` (validação + `ensureChatTokens` + espelhar
   colunas de token no create) — ver spec das correções de passagem.

---

## Hipóteses do doc de produto: confirmadas vs. corrigidas

| Afirmação do `base-evolucao.md` | Resultado |
|---|---|
| "O ponto de extensão existe (`conversation.channel`)" | ✅ Confirmada — e mais completo que o descrito |
| "Falta error handling configurável" | ✅ Concluído (2026-07-31) — error branch, retry, continue-on-error e error workflow entregues; só falta fallback declarativo entre providers de IA (fora de escopo do H2, ver `base-evolucao.md`) |
| "O sandbox que já existe resolve o isolamento" (node de código) | ❌ Refutada — env/require/SSRF são bloqueantes; ADR-005 já admitia |
| "O inbox é meio caminho conceitual" (aprovação) | ⚠️ O meio caminho é a UI/tokens; a semântica de pausa não existe e é o custo dominante |
| "O webhook já existe; falta autenticação por chave e docs" | ✅ Confirmada — mas falta também modo síncrono, node de resposta e gating por status |
| "Templates: falta CRUD" | ✅ Confirmada — com sanitização como pré-requisito não óbvio |

## Bugs e riscos encontrados de passagem

1. **Fluxo arquivado continua executando** via webhook e chat — o status só
   desliga o cron (`executions.service.ts:49-62`; `chat.service.ts:21-39`).
2. **`logic.delay` > 30s falha sempre** — config aceita 300s (`delay.ts:5`),
   sandbox mata em 30s (`engine.service.ts:22`).
3. **`logic.merge` + edge de erro (ou if/switch) = execução `success`
   incompleta silenciosa** (`engine.service.ts:151,343-350`).
4. **`use()` de template** sem validação de schema, sem `ensureChatTokens`
   (`templates.service.ts:14-49`).
5. Falhas tratadas por `onError:'branch'` invisíveis ao alerting (decidir se
   é by design).
6. Docblock do AI Debugger desatualizado — ainda diz que a engine é
   fail-fast sem fallback (`debugger.service.ts:62-66`).
7. Drift de tipo: `TriggerType` em `packages/shared/src/execution.ts:8` não
   inclui `"chat"` (existe no Prisma).

## Ordem sugerida dentro do H2

Reordenada em 2026-07-30 por decisão de produto: **WhatsApp vai para o fim**.
Nenhum outro tema depende dele (a ordem original o colocava cedo por razão de
mercado, não por dependência), e adiá-lo tem dois efeitos positivos: o error
handling estará maduro antes do canal (a janela de 24h da Meta vira um error
branch normal, ex. erro 131047 → fallback para template HSM) e o handoff
(item 12 do tema WhatsApp — `Conversation.status` nunca é escrito) pode ser
resolvido antes, dentro do tema de aprovação humana. **Atenção**: a
burocracia da Meta tem lead time externo que não depende de código —
verificação da Meta Business (CNPJ, 2-10 dias), número dedicado nunca usado
no WhatsApp comum, sandbox de testes. Disparar esse processo administrativo
em paralelo, bem antes de o desenvolvimento chegar lá.

1. **Correções baratas de passagem** — ✅ **concluído (2026-07-30)**, spec:
   [`spec-h2-01-correcoes-passagem.md`](spec-h2-01-correcoes-passagem.md).
2. **Templates CRUD** — ✅ **concluído (2026-07-30)**, spec:
   [`spec-h2-02-templates-crud.md`](spec-h2-02-templates-crud.md).
3. **Node de código** — ✅ **concluído (2026-07-30)**, spec:
   [`spec-h2-03-node-codigo.md`](spec-h2-03-node-codigo.md).
4. **Publicar como API** — ✅ **concluído (2026-07-31)**, spec:
   [`spec-h2-04-publicar-como-api.md`](spec-h2-04-publicar-como-api.md).
5. **Continue-on-error / error workflow** — ✅ **concluído (2026-07-31)**, spec:
   [`spec-h2-05-continue-on-error-error-workflow.md`](spec-h2-05-continue-on-error-error-workflow.md).
6. **Aprovação humana** — ✅ **concluído (2026-08-01)**, spec:
   [`spec-h2-06-aprovacao-humana.md`](spec-h2-06-aprovacao-humana.md). O mais
   invasivo (única mudança no coração da engine); o handoff que o WhatsApp
   vai precisar (item 12 do tema) continua em aberto — resolve a pausa
   genérica, não esse handoff específico.
7. **WhatsApp Cloud API** — movido para o fim (decisão 2026-07-30, ver nota
   acima); a burocracia da Meta corre em paralelo desde já.
