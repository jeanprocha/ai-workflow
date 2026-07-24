# ADR-008: Worker separado da API (execucao distribuida)

Status: Aceito
Data: 2026-07-24

## Contexto

Ate a Fase 9, `@workflow/api` fazia os dois papeis: servia HTTP e consumia
todas as filas BullMQ (execucoes, ingestao, health-check MCP, agendamentos) no
mesmo processo (ADR-005 v1). Isso significa que matar/reiniciar a API (deploy,
crash, OOM por um node pesado) derruba execucoes em andamento e a propria API,
e nao ha como escalar o consumo de fila independente da capacidade de servir
HTTP. A Fase 10 pede um worker como app separado, com deploy independente.

## Decisao

Mesmo codebase (`@workflow/api`), **dois entrypoints**:

- `apps/api/src/main.ts` — HTTP (`NestFactory.create`), so produz jobs
  (`ExecutionsService.trigger`, `SchedulerService`, etc.), nunca os processa.
- `apps/api/src/worker.main.ts` — sem HTTP (`NestFactory.createApplicationContext`),
  so consome filas (`ExecutionsProcessor`, `IngestionProcessor`,
  `McpHealthProcessor`, `ScheduleProcessor`, registrados em `worker.module.ts`).

Cada `*Processor` foi removido dos providers dos modules "de dominio"
(`ExecutionsModule`, `KnowledgeModule`, `McpModule`, `SchedulerModule`) —
esses modules agora so exportam service/controller — e re-registrado
exclusivamente em `WorkerModule`. Isso garante que a API nunca instancia um
`Worker` do BullMQ (nao processa jobs por engano), mesmo importando os
mesmos modules para os controllers/services.

Deploy: uma imagem Docker (`apps/api/Dockerfile`), dois servicos no Railway
apontando pra mesma imagem com Start Command diferente (ver
`docs/deploy/railway.md`). Escalar workers e so aumentar replicas do servico
`worker` — nao afeta o `api`.

### Efeitos colaterais desta decisao

- `ExecutionEventsService` (SSE de progresso, ADR-003) precisou virar Redis
  pub/sub: o motor roda no worker, o SSE e servido pela API — sem Redis,
  eventos emitidos no worker nunca chegariam aos clientes da API.
- `OrphanRecoveryService`: como agora um worker pode morrer no meio de uma
  execucao (crash, deploy, OOM), toda subida do worker varre execucoes presas
  em `running` ha mais tempo que qualquer execucao legitima levaria e marca
  como `failed` (com mensagem explicando o motivo, sem apagar historico).
  Complementa a recuperacao nativa de "stalled job" do BullMQ (que ja
  redistribui o job para outro worker quando um morre no meio do processamento).
- Isolamento de node (ADR-005 v3): com multiplos workers rodando em paralelo,
  cada execucao de node agora roda num `worker_thread` isolado
  (`NodeSandboxRunner`), com timeout duro (`worker.terminate()`, nao uma race
  de Promise) e limite de heap (`resourceLimits`). Callbacks de node
  (`getCredential`, `callAgent`, `searchKnowledge`, `callMcpTool`, `log`)
  cruzam a thread por RPC via `postMessage` — so o thread principal tem
  acesso a Prisma/criptografia/outros services.
- Rate limiting de IA (`packages/ai/src/rate-limiter.ts`): com N workers
  concorrentes, um limiter em memoria subestimaria o limite real de cada
  provider (cada processo teria seu proprio contador). Trocado por um
  contador de janela fixa no Redis, compartilhado por todos os processos.

## Alternativas consideradas

- **`apps/worker` como pacote pnpm separado**, importando os modules de
  `@workflow/api` via um subpath export (como `packages/shared` ja faz para
  `graph-diff`): descartado porque `nest build` compila via `tsc` puro
  (sem webpack), e `tsc` mistura a raiz de output (`outDir`) quando os
  arquivos de entrada vem de dois pacotes com `rootDir`s diferentes —
  produziria uma estrutura de `dist/` fragil. Dual-entrypoint dentro do
  mesmo pacote evita esse problema por completo e e um padrao comum em
  apps Nest+BullMQ.
- **Fila dedicada `ai-calls` com job assincrono (produtor/consumidor)**: o
  plano original pedia uma fila separada para chamadas de IA. Como as
  chamadas de IA hoje sao sincronas dentro da execucao do node (dentro do
  timeout/retry por node ja existente), transformar cada chamada de IA num
  job de fila exigiria reescrever esse fluxo para "enfileira e espera"
  (`job.waitUntilFinished`), uma mudanca de comportamento maior do que o
  necessario para o objetivo real (respeitar rate limit por provider entre
  workers). Optamos por um rate limiter distribuido (Redis) no ponto central
  onde todo node de IA e agente ja passa (`getProvider()` em
  `packages/ai/src/registry.ts`), sem alterar a semantica de execucao.
- **VM isolada / processo separado por node** (isolamento mais forte que
  worker_thread): mais seguro para codigo de terceiros (relevante para um
  futuro Marketplace), porem mais lento e operacionalmente mais complexo do
  que o necessario enquanto todos os nodes sao mantidos pelo time (ADR-005
  ja previa isso). Escolhido explicitamente pelo usuario: worker_thread com
  timeout duro + limite de memoria.

## Consequencias

- Cada execucao de node agora paga o custo de subir um `worker_thread`
  (validado empiricamente em ~650-700ms por node nos testes desta fase) —
  aceitavel frente a garantia de isolamento, mas around 10-20x mais lento que
  a chamada direta anterior; um pool de threads reutilizaveis fica como
  otimizacao futura se isso se provar um gargalo real em producao.
- Toda mudanca em `ExecutionsModule`/`KnowledgeModule`/`McpModule`/
  `SchedulerModule` precisa lembrar que o Processor mora em `worker.module.ts`,
  nao no module de dominio — documentado num comentario em cada module.
- Migração de banco (`prisma migrate deploy`) deve rodar uma unica vez (no
  servico `api`, nunca no `worker`) — documentado em `docs/deploy/railway.md`.
