# SPEC H2-06 — Aprovação humana (pausa durável)

Data: 2026-08-01. Origem: item 6 da ordem do H2
([`discovery-h2.md`](discovery-h2.md) §4 e §"Ordem sugerida"). Objetivo:
permitir que um fluxo pare no meio, sobreviva por horas ou dias esperando uma
decisão humana, e retome exatamente de onde parou — o único item do H2 que
exige mexer no coração da engine (execução em ondas, 100% em memória).

Caso concreto (Rein): cliente pede orçamento pelo WhatsApp → a IA monta a
proposta com desconto → **o fluxo para e manda um link pro vendedor** → ele
aprova pelo celular → o fluxo retoma e envia. É o que permite confiar
automação em processo com consequência real (dinheiro, envio ao cliente).

**Status: implementado (2026-08-01).**

---

## O problema estrutural (recapitulado do discovery)

O estado vivo de uma execução mora inteiro em variáveis locais de
`EngineService.run()` — `nodeOutputs`, `vars`, `executed`, `mergeBuffers`,
`currentWave`. Nada disso toca o banco durante a execução; todo caminho de
saída grava `success` ou `failed`. O sandbox mata qualquer node em 30s, então
"esperar dentro do node" nunca foi opção. E o orphan recovery mata qualquer
execução `running` há mais de 10 minutos no boot de todo worker — uma
aprovação pendente por dias pareceria uma execução travada.

Quatro armadilhas confirmadas no discovery, três delas em código escrito na
própria sessão anterior (H2-05):

1. **O flush de merge do H2-05 contorna a aprovação.** Com
   `Parallel → (A aprovação | B) → Merge`: A suspende, B enche 1 de 2 no
   buffer, a onda "esvazia" (o lado suspenso não roteia nada) e o flush
   parcial dispararia, executando o merge com a aprovação ainda pendente.
2. `markStuckExecutionAsFailed` (H2-04) marcava `queued|running` como failed
   e disparava o error workflow — se a suspensão saísse do `run()` por
   exceção, mataria a pausada e notificaria o usuário sem motivo.
3. Orphan recovery cortava por `startedAt`, que nunca é atualizado —
   execução retomada carregaria `startedAt` antigo e viraria elegível a ser
   morta no boot seguinte.
4. `TERMINAL_STATUSES` (waiter) e `PENDING_STATUSES` (controller) do H2-04
   eram allowlists desacopladas: um status novo caía no vão, e o invoke
   síncrono devolvia HTTP 200 com `output: null` para uma execução só
   pausada.

## Decisões de produto (usuário, 2026-07-31)

- Timeout padrão = **rejeitar** (configurável por node, `onTimeout`).
- Aprovador decide por **link público com token** (sem conta) **e** por uma
  fila autenticada `/approvals`.
- **O próprio node envia o e-mail** com o link — nada depois dele roda até a
  decisão, então quem avisa tem que ser o node da pausa.
- A decisão carrega **comentário opcional**, disponível pro resto do fluxo.

## Decisões técnicas (e justificativa)

| Decisão | Escolha | Por quê |
|---|---|---|
| Como o node sinaliza | RPC `ctx.requestApproval(...)` cria a linha e devolve `{approvalId, url}`; o node devolve um descritor **genérico** `SuspendDescriptor { reason, ref, label }` | A engine nunca interpreta "é uma aprovação" — só sabe suspender. Qualquer node futuro (espera de webhook externo, etc.) reaproveita o mesmo mecanismo. |
| Retomada | O **mesmo node roda de novo**, agora com `ctx.resumeData` preenchido, e devolve `branches: ['approved'\|'rejected']` | Reusa o loop de roteamento existente — zero código novo de roteamento na engine. |
| Semântica da pausa | **Drenar-e-pausar**: o node suspenso não roteia nada, o resto da onda segue normalmente, e a execução só pausa quando a frente esvazia | Faz `logic.parallel` se comportar certo (irmãos terminam) e elimina a necessidade de persistir uma "onda pendente". |
| Onde persistir o frontier | Tabela `ExecutionPausedState` 1:1, **não coluna** | `list()` usa `include` sem `select` — uma coluna Json devolveria até 100 blobs de frontier por página de `/executions`. Relação nunca vem sem pedir. Teto de 1MB no state serializado. |
| Rejeição | É **branch**, não falha | Reusa o mecanismo de `branches` que já existe; quem quiser que rejeição derrube o fluxo conecta a saída num node que falha. |
| Timeout | **Sweeper repeatable**, não delayed job | O repo tinha zero precedente de `{delay}` no BullMQ, e um delayed job exigiria cancelar ao decidir cedo e recriar após qualquer flush do Redis. O Postgres já é a fonte da verdade (`expiresAt` na própria linha). |
| Fila do sweeper | `APPROVALS_QUEUE` nova | `schedule.processor.ts` lê `job.data.workflowId` incondicionalmente — um job de sweep ali lançaria a cada tick. |
| E-mail | Enviado pelo node com **credencial SMTP do workspace**, não pelo `MailerService` da plataforma | `recipients` livre + SMTP de sistema é relay aberto e queima a reputação do domínio da plataforma. |
| Link | Abre uma **página** que faz POST. Nunca `GET /approve/:token/decide` | Scanner de link de Outlook/Gmail aprovaria sozinho. Precedente correto já no repo: reset de senha. |
| Chat + aprovação | **Bloqueado no v1**, `graph.schema.ts` rejeita `approval.human` num grafo com `trigger.chat` | `conversation.state` só é persistido no bloco terminal de `run()`; uma 2ª mensagem do visitante durante a pausa causaria lost update silencioso no `$vars` da conversa. |
| Guard de status | `EXECUTION_PHASE: Record<ExecutionStatus, 'pending'\|'waiting'\|'terminal'>` em `packages/shared`, `Record` exaustivo | Quebra o build quando alguém adicionar um status sem mapear; um `Set` aceitaria em silêncio. |
| Consumo da decisão | `updateMany({where: {decidedAt: null, expiresAt: ...}}) + count check`, molde `ApiKeysService.revoke` | Humano (via token ou autenticado) e sweeper (timeout) disputam a mesma linha sem transação distribuída — o predicado de `expiresAt` (invertido entre os dois casos) decide quem ganha. |
| Retry do RPC pós-crash | `ApprovalsService.create` faz **upsert**, não `create` | Se o sandbox morrer depois do RPC criar a linha mas antes do node terminar, a próxima tentativa cai no mesmo par `[executionId, nodeId]` e **rotaciona o token** em vez de duplicar ou falhar. "Só o último link vale", documentado. |

## O contrato genérico de pausa (`packages/nodes`)

```ts
// NodeExecutionResult
suspend?: {
  reason: string;   // vira log/evento, nunca interpretado pela engine
  ref: string;       // identificador da pendência no domínio do node (id da Approval)
  label?: string;    // rótulo curto pra UI
};

// NodeExecutionContext
resumeData?: unknown; // presente SÓ na retomada; undefined na 1ª passada — é o sinal que o node usa
requestApproval: (params: { title, timeoutHours, onTimeout }) =>
  Promise<{ approvalId: string; url: string }>;
```

O node `approval.human`:

```ts
execute: async (ctx) => {
  if (ctx.resumeData === undefined) {
    const { approvalId, url } = await ctx.requestApproval({ title, timeoutHours, onTimeout });
    // ... envia e-mail via SMTP do workspace, com `url` no corpo ...
    return { output: ctx.input, suspend: { reason: 'approval', ref: approvalId, label: title } };
  }
  const d = ctx.resumeData; // { approved, comment, decidedBy, decidedAt }
  return {
    output: { input: ctx.input, ...d },
    branches: [d.approved ? 'approved' : 'rejected'],
  };
}
```

## Mudanças na engine (o commit caro)

- Claim atômico no início de `run()`:
  `updateMany({where: {status: {in: ['queued','waiting_approval']}}, data: {status: 'running', runStartedAt}})`
  — cobre enfileiramento inicial e toda retomada; `count === 0` significa que
  outro worker já assumiu (job stalled reentregue, ou sweeper e decisão
  humana correndo entre si).
- Consumo de um resultado com `suspend` **não toca** `nodeOutputs`/
  `lastOutput`/`respondOutput` — o node não "aconteceu" do ponto de vista do
  grafo até a decisão chegar. `usage` (tokens/custo) ainda conta.
- Roteamento: node suspenso não dispara nenhuma edge — nem normal, nem de
  erro.
- **Guard crítico no flush de merge** (H2-05):
  `if (nextWave.size === 0 && suspendedAll.size === 0)` — sem o segundo
  termo, um `Parallel` com um lado suspenso e outro completo enche só 1 de 2
  no buffer do `Merge`, a onda "esvazia", e o flush executaria o merge com a
  aprovação ainda pendente.
- Ao final da onda com `suspendedAll.size > 0`: persiste `PausedStateV1`
  (`nodeOutputs`, `vars`, `lastOutput`, `respondOutput`, `executed` **menos**
  os nodes suspensos — invariante crítica, sem isso o restore acharia a onda
  de retomada já "executada" e terminaria `success` silencioso), marca
  `waiting_approval`, emite `execution.suspended`, retorna.
- Restore (dentro de `options.resume`): carrega `ExecutionPausedState`,
  valida `version` (falha explícita se divergir — nunca interpreta às
  cegas), restaura o frontier, popula `resumeDataByNode` só pro node alvo
  (irmãos ainda suspensos continuam suspensos), apaga a linha.
- `durationMs` soma `elapsedMsBeforePause` — uma execução pausada por dias
  não reporta esses dias como tempo de execução.
- `ExecutionStep.status` ganhou `'waiting_approval'` — a 1ª passada do node
  grava esse status ("aguardando"), a retomada grava um 2º step
  (`success`/`failed`) com a decisão. Timeline honesta.

## Fechando as armadilhas do discovery

- `markStuckExecutionAsFailed`: filtro derivado de
  `PENDING_EXECUTION_STATUSES` (`@workflow/shared`) em vez de array
  hardcoded — exclui `waiting_approval` por construção.
- Orphan recovery: filtra por `runStartedAt` (regravado em todo claim), não
  `startedAt` (imutável).
- `execution-waiter.ts` + `flow-api.controller.ts`: derivados do mesmo
  `EXECUTION_PHASE` — `waiting_approval` nunca é "terminal", e o invoke
  síncrono devolve **202 + `resultUrl`**, nunca 200 com `output: null`.
- Aprovações abertas são **invalidadas** (`decision: 'void'`) nos 3 caminhos
  terminais de uma execução (fim normal da engine, rede de segurança do
  processor, orphan recovery) — sem isso, um link de e-mail continuaria
  "válido" apontando pra uma execução que já morreu por outro motivo.
- `retry`/`replay` de uma execução `waiting_approval` → 409 explícito.

## Fases de implementação (commits)

**C1 — pausa durável na engine** (feito): schema (`waiting_approval`,
`runStartedAt`, `suspendedAt`, `elapsedMsBeforePause`, tabela
`ExecutionPausedState`); `EXECUTION_PHASE` exaustivo em `packages/shared`
substituindo os 6 espelhos manuais do enum; contrato genérico de suspensão
em `packages/nodes` + RPC atravessando o worker_thread
(`sandbox-messages.ts`, `node-worker-entry.ts`, `node-sandbox-runner.ts`,
que virou params por objeto); as mudanças cirúrgicas na engine descritas
acima; `executions.processor.ts`/`orphan-recovery.service.ts`/
`execution-waiter.ts`/`flow-api.controller.ts` fechando as 4 armadilhas;
`ExecutionsService.enqueueResume`. Unit tests: suspende e persiste; retoma e
conclui; dois suspends na mesma onda; `Parallel → Merge` com um lado
suspenso (regressão do guard do flush); restore com versão incompatível.

**C2 — model Approval + node + endpoints + sweeper** (feito): model
`Approval` (`@@unique([executionId, nodeId])`, índices por
`[workspaceId, decidedAt]` e `[decidedAt, expiresAt]`); node
`approval.human`; `ApprovalsService` (create via upsert com rotação de
token, consumo atômico com guard de expiração invertido entre
decide/timeout, `voidOpenApprovals`); controller autenticado
(`GET /approvals`, `POST /approvals/:id/(approve|reject)`) e público
(`GET /approve/:token`, `POST /approve/:token/decide` com mensagem única
pra qualquer recusa); `ApprovalsSweepProcessor` (duas varreduras: timeout
aplicado + decididas-nunca-enfileiradas, com teto de tentativas antes de
falhar a execução explicitamente); gate no `graph.schema.ts`; 409 em
retry/replay. Unit tests: `approvals.service.spec.ts` (upsert/rotação,
consumo atômico, guards de expiração opostos, void).

**C3 — UI** (feito): página pública `/approve/[token]` (GET real de estado
+ POST de decisão, 4 estados — pendente/decidida/expirada/inválida — não o
form single-shot do reset-password); `/approvals` autenticada
(mestre-detalhe, molde `inbox-view.tsx`); nav (`nav.ts` +
`dictionaries/nav.ts` pt/en); badge + banner "aguardando aprovação" no
detalhe da execução, com link pra fila; `refetchInterval` reconhecendo
`waiting_approval`; "Replay a partir daqui" escondido no step
`waiting_approval`; painel de config do node (`ApprovalHumanFields`) +
i18n pt/en (`configPanel.approvalHuman`, `nodeCatalog.descriptions`);
`STATUS_OPTIONS` do filtro da lista.

**C4 — e2e + docs** (feito): e2e com o helper `mailpit.ts` estendido
(`waitForApprovalToken`, path param `/approve/<token>`, não query string);
cenários: aprovar (`@smoke`), rejeitar, duas decisões simultâneas (corrida
200/409), retry/replay de `waiting_approval` (409), `Parallel → Merge` com
lado suspenso (regressão do guard do flush), invoke síncrono publicado numa
execução que pausa (202 + `resultUrl`, nunca 200). **Fora do e2e**: timeout
via sweeper — o node só aceita `timeoutHours >= 1` (schema), então não há
como produzir uma `Approval` vencida em tempo real de teste sem um backdoor
de banco que este repo não tem; a lógica do sweeper é coberta por unit
tests. Bugs reais pegos só ao rodar o e2e de verdade (ver "Bugs encontrados"
abaixo). Docs: este arquivo, `discovery-h2.md` item 6,
[`ADR-011`](../adr/011-pausa-duravel.md).

## Bugs encontrados rodando o e2e (corrigidos no processo)

- `POST /approvals/:id/(approve|reject)` e `POST /approve/:token/decide`
  devolviam **201** (default do Nest pra POST) em vez de **200** — ação
  sobre um recurso já existente, não criação. `@HttpCode(HttpStatus.OK)`
  adicionado nos três, mesmo precedente de `FlowApiController.invoke`.
- Mailpit neste ambiente de dev leva **~10s** só para mandar o "220" inicial
  da conexão SMTP (medido isolado com um socket raw — nada a ver com
  nodemailer nem com o node; provável reverse-DNS no connect). Timeouts dos
  helpers de e2e (`waitForApprovalToken`, `invokeFlowApi` nos cenários que
  esperam e-mail) ajustados pra absorver essa latência do ambiente — não é
  bug de produto, e não há fix de código de produto razoável (encurtar o
  `connectionTimeout` do node arriscaria falso-negativo contra um SMTP real
  e lento em produção).

## Critérios de aceite

Todos verificados (unit + e2e + smoke manual via curl contra o dev real):

- Fluxo `trigger.manual → approval.human → logic.log`: roda, a execução vira
  `waiting_approval`, o e-mail chega no Mailpit com o link. ✅
- Decidir "aprovar" pelo link: a execução retoma, roteia pelo branch
  `approved`, termina `success`. O node de aprovação grava dois steps
  (`waiting_approval` → `success`). ✅
- Decidir "rejeitar": roteia por `rejected`. ✅
- Duas decisões simultâneas pro mesmo token: exatamente uma 200, a outra
  409 (consumo atômico). ✅
- `Parallel` com um lado em aprovação e outro completo, os dois num
  `Merge`: a execução pausa (o merge **não** roda cedo demais); ao decidir,
  o merge completa com os dois lados. ✅
- `retry`/`replay` de uma execução `waiting_approval` → 409. ✅
- Invoke síncrono publicado (`v1/flows/:id/invoke`) numa execução que pausa
  → 202 com `resultUrl`, nunca 200 com `output: null`. ✅
- Aprovação humana num grafo com `trigger.chat` → rejeitada no save. ✅

## Fora de escopo (deliberado)

- **Multi-nível de aprovação** (2 aprovadores em sequência, quorum) — v1 é
  uma decisão única por node; encadear é conectar dois nodes
  `approval.human`.
- **Chat + aprovação** — bloqueado explicitamente (ver decisões técnicas);
  revisitar se `conversation.state` ganhar um mecanismo de lock/versão.
- **Delayed job / cancelamento fino de timeout** — o sweeper reavalia a
  cada tick; decidir 1 segundo antes do timeout, no pior caso, ainda espera
  até o próximo tick pra invalidar o job de timeout (que de qualquer forma
  perde a corrida atômica — não há efeito observável, só o tick "desperdiçado").
- **Deep-link do banner de execução pra aprovação específica** — o banner
  linka pra `/approvals` (a fila inteira), não pra
  `/approvals?executionId=...`; um filtro dedicado fica como follow-up de UX
  se virar fricção real.
