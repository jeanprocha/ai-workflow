# SPEC H2-04 — Publicar fluxo como API

Data: 2026-07-30. Origem: item 4 da ordem do H2 ([`discovery-h2.md`](discovery-h2.md)
§5). Objetivo: o padrão Dify — um fluxo do editor vira um endpoint HTTP
estável, autenticado por chave, que devolve o **resultado** da execução na
mesma chamada. É o que transforma um fluxo em um serviço consumível por
qualquer sistema externo, sem o consumidor saber que existe um editor visual
por trás.

**Status: implementado (2026-07-31).** O discovery que precedeu a
implementação derrubou o mecanismo síncrono originalmente proposto aqui
(pub/sub, decisão 3 abaixo) — ver nota no início da seção C2 e o plano
correspondente. O resto do spec (contrato, modelo de chave, node
`api.respond`) foi implementado como descrito.

---

## O que o discovery encontrou (e o que já foi corrigido antes)

O webhook atual (`POST /hooks/:webhookId`) é o embrião, mas com quatro
limitações estruturais:

1. **Sem identidade**: a URL secreta (UUID) é a única credencial. Não há
   como revogar sem regenerar o fluxo, nem distinguir chamadores.
2. **100% assíncrono, sem caminho de volta**: devolve a `Execution` com
   status `queued` (201) e o resultado nunca chega ao chamador — a engine só
   existe no processo worker (`worker.module.ts`), e `GET /executions/:id`
   exige JWT + workspace.
3. **`outputPayload` é não determinístico com fan-out**: é o `lastOutput` do
   último node da última onda — com `logic.parallel` ou branches, "o
   resultado" é acidental.
4. **A URL sempre executa `currentVersionId`**: todo Ctrl+S no editor muda a
   API pública na hora ("publicar" e "salvar" são a mesma operação,
   `workflows.service.ts`).

Já resolvido antes deste tema: fluxo `archived` não dispara mais por
webhook/chat (H2-01, correção A).

## Decisões (e alternativas rejeitadas)

1. **Endpoint novo, separado do webhook** — `POST /v1/flows/:workflowId/invoke`
   com `Authorization: Bearer <chave>`. O webhook atual (`/hooks/:webhookId`)
   **não muda**: continua sendo a capability URL simples para "cole essa URL
   no seu sistema" (fire-and-forget). São dois produtos: webhook = entrada
   crua; API = contrato com identidade, resposta e limites. *Rejeitado*:
   enfiar auth opcional + modo síncrono no `/hooks` — misturaria dois modelos
   de autenticação numa rota pública existente.
2. **Chave por fluxo, hash no banco, valor mostrado uma única vez.** Model
   `WorkflowApiKey { id, workflowId, name, keyHash @unique (sha256),
   lastFour, createdAt, lastUsedAt, revokedAt }` — molde do
   `PasswordResetToken` (raw só na criação, sha256 + lookup por índice
   único). Formato do raw: `wfk_` + 32 bytes hex (o prefixo facilita docs,
   suporte e secret scanning). Revogar = `revokedAt`, nunca hard delete
   (auditabilidade). Múltiplas chaves ativas por fluxo (rotação sem
   downtime). Lookup por hash via índice único dispensa `timingSafeEqual`
   (não há comparação byte a byte de segredo — padrão GitHub tokens).
   *Rejeitado*: chave por workspace (grossa demais — revogar derrubaria
   todos os fluxos publicados) e JWT assinado stateless (sem revogação).
3. **Modo síncrono sem mover a engine, por POLLING do banco (não pub/sub).**
   *Revisado na implementação*: a versão original desta decisão propunha
   assinar o canal `execution.completed` do `ExecutionEventsService` antes de
   enfileirar. O discovery que precedeu o código provou que isso não fecha a
   corrida — `subscribe()` (`execution-events.service.ts`) faz
   `void subscriber.subscribe()` sem aguardar a confirmação do Redis, sem
   replay/buffer, e o subscriber é **compartilhado com o SSE do editor**
   (um invoke que desiste podia derrubar o live view de quem está editando).
   A engine grava `status`/`outputPayload`/`error`/`durationMs` num único
   `prisma.execution.update` — um SELECT que vê status terminal já vê o
   output no mesmo snapshot MVCC, sem corrida nenhuma. `ExecutionWaiter`
   (`apps/api/src/flow-api/execution-waiter.ts`) faz polling com rampa de
   backoff (30/60/120ms nas 3 primeiras tentativas, depois 150ms até 3s,
   450ms até 12s, 1s daí em diante, +20% de jitter) e timeout configurável
   (`?timeoutMs=`, default 30s, cap 60s). Ao estourar o timeout, ao cliente
   desistir (`req.on('close')`), ou ao não haver capacidade (cap de
   `FLOW_API_MAX_SYNC_WAITERS`, default 200 — protege conexões HTTP presas,
   não o Postgres): **degrada para 202** com a URL do GET. `?mode=async` pula
   a espera e devolve 202 direto. *Rejeitado*: instanciar a engine no
   processo da API (execução inline) — muda a arquitetura de worker por
   causa de um caso de uso, e perderia retry/recovery da fila. Consertar o
   `ExecutionEventsService` (subscribe aguardado, refcount, output no
   evento) é o caminho certo para baixar a latência do modo síncrono no
   futuro — fica como tema à parte, não apêndice deste.
4. **Consulta de resultado com a mesma chave** —
   `GET /v1/flows/:workflowId/executions/:executionId` (Bearer, execução
   precisa pertencer ao fluxo da chave). Sem isso a história async não fecha:
   o 202 apontaria para um endpoint que exige JWT.
5. **Node `api.respond` para resultado determinístico.** Passthrough
   (output = input) que **marca** seu output como a resposta da API. Na
   engine: quando um node desse tipo roda com sucesso, o output vai para
   `respondOutput` (primeiro vence; segundo gera log de warning);
   ao final, `outputPayload = hasRespondOutput ? respondOutput : lastOutput`
   — **sem coluna nova e sem quebrar o comportamento atual** de fluxos sem o
   node. *Revisado na implementação*: a versão original da regra era
   `respondOutput ?? lastOutput`, que quebra quando o respond devolve
   `null`/`undefined` de propósito — cairia no fallback `lastOutput`,
   exatamente o não-determinismo que o node existe para eliminar. Por isso
   um booleano `hasRespondOutput` separado, não um sentinela de valor.
   *Rejeitado no v1*: status code/headers customizados no respond — a
   resposta HTTP é sempre o envelope da plataforma.
6. **Envelope JSON sempre**:
   `{ executionId, status, output, error, durationMs }`. *Rejeitado no v1*:
   modo raw-body (devolver só o output cru) — fica como config futura do
   respond node se houver demanda.
7. **Invoke exige fluxo `active`** — mais estrito que o webhook (onde
   `draft` dispara, para testes). Chave inválida/revogada → 401; fluxo
   não-ativo → 409 com mensagem clara (o dono da chave não é um atacante —
   erro explícito vale mais que 404 opaco). Publicar = criar chave + ativar
   o fluxo; sem conceito novo de "publicado".
8. **Entrada pelo node `trigger.webhook` existente**, `triggerType:
   'webhook'`. O invoke é, na essência, um webhook autenticado e síncrono —
   zero mudança na engine/enum. Fluxo publicável = fluxo com trigger de
   webhook. *Adiado*: `TriggerType 'api'` dedicado para analytics (migration
   de enum + shared + UI por um rótulo).
9. **Rate limit por chave em memória** (molde `chat-rate-limit.ts`, 60/min
   por chave, env), somado ao Throttler global por IP. Limitação documentada:
   por instância, não coordenado — upgrade para Redis quando houver mais de
   uma réplica da API.
10. **Versionamento: `currentVersionId`, com a limitação documentada.**
    Pinar uma versão publicada ≠ versão de edição exige o conceito de
    ponteiro duplo (draft/published) com UI própria — fica explicitamente
    para uma fase 2 deste tema ou H3. No v1, salvar o editor muda a API
    (como hoje no webhook), e a resposta carrega o `versionId` usado para
    rastreabilidade.
11. **Docs no v1 = snippet na UI, não Swagger.** A seção "Publicar como API"
    no painel do `trigger.webhook` mostra a URL, gerencia chaves e exibe um
    `curl` de exemplo com o envelope. Swagger/OpenAPI global continua no H3.

## Contrato da API pública (v1)

```
POST /v1/flows/:workflowId/invoke
  Authorization: Bearer wfk_<hex>
  Body: JSON livre (vira o input do trigger)
  Query: ?timeoutMs=30000 (cap 60000) | ?mode=async

  200 { executionId, status: "success"|"failed", versionId, output, error, durationMs }
  202 { executionId, status: "queued"|"running", versionId, output, error, durationMs, resultUrl }
  401 chave ausente/invalida/revogada
  409 fluxo nao esta ativo
  429 rate limit da chave

GET /v1/flows/:workflowId/executions/:executionId
  Authorization: Bearer wfk_<hex>
  200 { executionId, status, versionId, output, error, durationMs }
  404 execucao nao pertence a este fluxo
```

Gestão de chaves (autenticada, WorkspaceGuard, qualquer membro):
`POST /workflows/:id/api-keys { name }` → devolve o raw **uma única vez**;
`GET /workflows/:id/api-keys` → lista com `lastFour`/`lastUsedAt`/`revokedAt`;
`DELETE /workflows/:id/api-keys/:keyId` → revoga.

## Fases de implementação (commits)

**C1 — chave + invoke async** (feito): migration `workflow_api_keys` (FK
cascade, `key_hash @unique`); `ApiKeysService` (criar com `randomBytes` +
sha256, listar, revogar) + CRUD no workflows controller; guard novo
(`FlowApiKeyGuard`: extrai Bearer, hash, lookup, checa `revokedAt`, valida
que a chave pertence ao `:workflowId` do path, popula request; atualiza
`lastUsedAt` fire-and-forget com throttle de 60s); controller `v1/flows` com
invoke `?mode=async` (202) + rate limit por chave (com eviction, diferente
do molde `chat-rate-limit.ts`); gating por status active. Unit tests (guard,
service, gating).

**C2 — modo síncrono + node respond + rede de segurança** (feito):
`ExecutionWaiter` faz polling do banco com backoff (não pub/sub — ver
decisão 3 revisada); node `api.respond` (packages/nodes, passthrough) +
`respondOutput`/`hasRespondOutput` na engine (primeiro vence, warning no
segundo); endpoint GET de resultado; **rede de segurança adicional**: um bug
pré-existente (execução fica `running` para sempre se a engine explodir
antes de gravar o status final) virou visível de verdade com o invoke
síncrono — corrigido em `executions.processor.ts` com um `try/catch` em
volta do `engine.run()` que marca a execução como `failed` de forma
idempotente (`updateMany` gateado por status não-terminal) e emite o evento
de conclusão. Unit tests: engine (respond com fan-out, `null`/`undefined`
do respond vencendo o `lastOutput`), waiter (polling, timeout, abort,
`clampTimeoutMs`), processor (rede de segurança).

**C3 — UI** (feito): seção "Publicar como API" no painel do
`trigger.webhook` (criar/revogar/listar chaves, raw mostrado uma vez com
copiar, snippet curl, endpoint, aviso "salvar o fluxo altera a API na
hora"); botão de copiar de brinde na URL do webhook; catálogo/painel/i18n
(pt+en)/ícone (`Reply`) do `api.respond`.

**C4 — e2e + docs** (feito): `apps/e2e/tests/flows/publish-api.spec.ts` —
invoke sync feliz (`@smoke`), fan-out não-vácuo (prova que o respond vence
mesmo quando não é o último node processado na onda), `?mode=async` + GET,
401 (ausente/inválida/revogada/de outro fluxo), 404 (execução de outro
fluxo), 409 (draft e archived), 429 (limite por chave sem o Throttler
global interferir), não-regressão do `/hooks/:webhookId`, e listagem de
chaves nunca vazando `key`/`keyHash`. `pt-to-en.ts` ganhou as 4 mensagens
novas do guard/controller (essas **passam** pelo filtro HTTP, diferente das
mensagens de node).

## Critérios de aceite

Todos verificados (unit + e2e + smoke manual via curl contra o dev real):

- Fluxo com `trigger.webhook → api.respond` ativo + chave criada:
  `curl -X POST .../invoke` devolve 200 com o output do respond em <30s. ✅
- O mesmo fluxo com um branch paralelo extra: o output continua sendo o do
  respond (determinístico), não o do último node por acaso. ✅ (e2e
  "fan-out: o output publicado e o do api.respond")
- Chave revogada → 401 imediato; fluxo arquivado/draft → 409; sem chave →
  401; chave de outro fluxo → 401. ✅
- `?mode=async` → 202 + `GET .../executions/:id` com a mesma chave devolve o
  resultado quando pronto; com execução de OUTRO fluxo → 404. ✅
- Execução que estoura o timeout síncrono → 202 (não 500, não conexão
  pendurada), e o resultado continua consultável. ✅ (via degradação do
  `ExecutionWaiter`, coberto por `execution-waiter.spec.ts`)
- Webhook `/hooks/:webhookId` continua funcionando exatamente como antes. ✅
- Raw da chave nunca aparece em log, listagem nem resposta além da criação. ✅

## Fora de escopo (deliberado)

- **Versão publicada ≠ versão de edição** (ponteiro duplo draft/published) →
  fase 2 deste tema ou H3; limitação documentada na UI.
- **Swagger/OpenAPI global** → H3 (como já estava).
- **Status/headers customizados no respond e modo raw-body** → por demanda.
- **Rate limit distribuído (Redis)** → quando houver >1 réplica da API.
- **`TriggerType 'api'` dedicado** → junto com analytics por chave.
- **Chaves com escopo de workspace ou permissões** → RBAC é H3.
