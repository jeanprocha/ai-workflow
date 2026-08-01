# ADR-011: Pausa durável da execução (aprovação humana)

Status: Aceito
Data: 2026-08-01

## Contexto

H2-06 pede que um fluxo pare no meio da execução e espere uma decisão
humana por horas ou dias antes de continuar — o node de aprovação manda um
link, alguém decide, o fluxo retoma exatamente de onde parou.

A engine (`EngineService.run()`, ADR-005) percorre o grafo em ondas
(`Promise.all` por onda), com **todo** o estado vivo — `nodeOutputs`,
`vars`, `executed`, `mergeBuffers`, `currentWave` — em variáveis locais da
chamada. Nada disso toca o banco durante a execução; os únicos caminhos de
saída gravam `success` ou `failed`. Cada node roda isolado num
`worker_thread` com timeout duro de 30s (ADR-005 v3) — "esperar dentro do
node" nunca foi opção. E `OrphanRecoveryService` mata qualquer execução
`running` há mais de 10 minutos no boot de todo worker — uma execução
pausada por dias pareceria exatamente uma execução travada.

Não dava pra tratar isso como "só mais um status" — três mecanismos escritos
na sessão anterior (H2-05) tinham premissas que uma pausa real quebraria:

1. O flush parcial de `logic.merge` (H2-05) executa um merge assim que a
   onda "esvazia", mesmo com o buffer incompleto — um `Parallel` com um lado
   suspenso e outro completo enche só 1 de 2 no buffer, a onda esvazia (o
   lado suspenso não roteia nada), e o flush executaria o merge com a
   aprovação ainda pendente.
2. `markStuckExecutionAsFailed` (H2-04, rede de segurança do processor)
   marcava qualquer `queued|running` como `failed` se `engine.run()`
   lançasse — mataria uma pausada legítima se a suspensão saísse por
   exceção.
3. `TERMINAL_STATUSES`/`PENDING_STATUSES` do invoke síncrono publicado
   (H2-04) eram duas allowlists desacopladas — um status novo cairia no
   vão, e o invoke devolveria HTTP 200 com `output: null` pra uma execução
   só pausada.

## Decisão

**O node sinaliza pausa com um descritor genérico; a engine nunca sabe que é
uma aprovação.**

```ts
interface SuspendDescriptor { reason: string; ref: string; label?: string }
// NodeExecutionResult.suspend?: SuspendDescriptor
// NodeExecutionContext.resumeData?: unknown  (presente só na retomada)
```

O node pede a criação da pendência via RPC (`ctx.requestApproval`, cruza o
worker_thread como `getCredential`/`callAgent` já fazem), devolve `suspend`
imediatamente (antes do timeout de 30s), e a engine:

1. **Não roteia nada** a partir do node suspenso (nem edges normais, nem de
   erro) — ele "não aconteceu" do ponto de vista do grafo.
2. **Drena a onda**: os irmãos do node suspenso (ex.: outro branch de um
   `Parallel`) terminam normalmente antes da execução pausar — só pausa
   quando a fronteira de nodes prontos esvazia de verdade.
3. Ao esvaziar com pelo menos um node suspenso, **persiste o frontier**
   inteiro (`nodeOutputs`, `vars`, `lastOutput`, `mergeBuffers`, quais nodes
   estão suspensos e com que input) numa tabela própria
   (`ExecutionPausedState`, 1:1 com `Execution`, versionada), marca
   `waiting_approval` e retorna.
4. Na retomada, o **mesmo node roda de novo**, com `resumeData` preenchido
   — o node decide o que fazer (tipicamente devolver `branches`) e o loop
   de roteamento **existente** cuida do resto. Zero código novo de
   roteamento.

**Guard que fecha a armadilha #1**: o flush parcial de merge (H2-05) só
dispara com `nextWave.size === 0 && suspendedAll.size === 0` — o segundo
termo é o que impede um merge de completar com a aprovação ainda pendente.

**Claim atômico** substitui o `update` incondicional no início de `run()`:
`updateMany({where: {status: {in: ['queued','waiting_approval']}}, data: {status:'running', runStartedAt}})`.
Cobre enfileiramento inicial e toda retomada com o mesmo código;
`count === 0` sinaliza que outro worker já assumiu (job stalled reentregue,
ou sweeper e decisão humana correndo entre si) e a chamada simplesmente
retorna. `runStartedAt` (regravado em todo claim) substitui `startedAt`
(imutável) como sinal de "travou" pro orphan recovery — fecha a armadilha
#3.

**`EXECUTION_PHASE`** (`packages/shared`) é um `Record<ExecutionStatus,
'pending'|'waiting'|'terminal'>` exaustivo — todo lugar que hoje mantinha
uma allowlist manual de "terminal" ou "pendente" (`execution-waiter.ts`,
`flow-api.controller.ts`, `orphan-recovery.service.ts`,
`executions.processor.ts`) deriva daqui. Um `Record` quebra o build se um
status novo não for mapeado; um `Set` aceitaria em silêncio — fecha a
armadilha #2 e #4 pela raiz (a causa era exatamente ter duas fontes de
verdade desacopladas), não com um patch pontual em cada um dos 6 lugares.

**Timeout via sweeper repeatable** (BullMQ), não delayed job: o Postgres
(`Approval.expiresAt`) já é a fonte da verdade, e o repo não tinha nenhum
precedente de job com `{delay}` — um delayed job exigiria cancelar e
recriar a cada decisão antecipada, e sobreviver a um flush do Redis sem
perder o agendamento. O sweeper roda em duas varreduras por tick: aplica
timeout em quem venceu o prazo sem decisão, e reenfileira retomadas que
foram decididas mas o `queue.add()` nunca chegou a rodar (worker morreu
entre o `updateMany` da decisão e o enfileiramento — a fila não define
`attempts`, então esse job nunca teria sido retentado sozinho).

## Alternativas consideradas

- **Persistir o frontier numa coluna JSON de `Execution`**, não tabela
  separada: descartado porque `ExecutionsService.list()` faz `include` sem
  `select` — uma coluna com o frontier completo devolveria até 100 blobs
  (potencialmente grandes) por página da lista de execuções. Tabela 1:1
  nunca vem sem pedir explicitamente.
- **Delayed job na `SCHEDULES_QUEUE` existente** para o timeout: cogitado no
  discovery, descartado — `schedule.processor.ts` lê `job.data.workflowId`
  incondicionalmente e chamaria `executions.trigger`; um job de sweep ali
  lançaria a cada tick. Fila dedicada (`APPROVALS_QUEUE`) evita esse
  acoplamento e mantém o sweeper simples (repeatable, sem gerenciar
  cancelamento de delayed job).
- **Marcar rejeição como falha da execução**: descartado — rejeição é uma
  decisão de negócio válida, não um erro do sistema. Reusa `branches` (o
  mesmo mecanismo de `If`/`Switch`); quem quiser que uma rejeição derrube o
  fluxo conecta a saída `rejected` num node que falha explicitamente.
- **Interpretar "aprovação" na engine** (ex.: `NodeStepResult.needsApproval`
  em vez de um `suspend` genérico): descartado — acoplaria a engine a um
  domínio específico. O descritor genérico (`reason`/`ref`/`label`) permite
  qualquer pausa futura (esperar um webhook externo, por exemplo) reusar
  exatamente o mesmo mecanismo sem tocar `engine.service.ts` de novo.

## Consequências

- Todo node que precisar pausar no futuro usa o mesmo contrato
  (`suspend`/`resumeData`) — a engine não precisa mudar de novo.
- `ExecutionStep.status` ganhou um terceiro valor (`waiting_approval`) além
  de `success`/`failed` — qualquer código que iterava steps assumindo só
  dois status (nenhum encontrado na auditoria desta fase, mas vale
  vigilância) precisa contemplar o terceiro.
- `durationMs` de uma execução pausada soma `elapsedMsBeforePause` — sem
  isso, dias de espera humana apareceriam como tempo de execução real,
  distorcendo qualquer métrica de performance derivada.
- Toda aprovação aberta precisa ser invalidada (`decision: 'void'`) nos 3
  caminhos pelos quais uma execução pode fechar como terminal — um 4º
  caminho terminal futuro (se algum aparecer) precisa lembrar de fazer o
  mesmo, ou um link de e-mail continuaria "válido" para uma execução já
  morta.
- Retry/replay de uma execução `waiting_approval` são bloqueados (409) —
  quem quiser desistir de uma aprovação pendente precisa decidir (rejeitar)
  ou esperar o timeout; não há um "cancelar" direto por enquanto.
