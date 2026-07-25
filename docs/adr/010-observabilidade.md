# ADR-010: Camada de observabilidade (logging, metricas, health, telemetria de IA e de client)

Status: Aceito
Data: 2026-07-25

## Contexto

Ate a Fase 10, o backend inteiro tinha ~11 linhas de log nao-estruturadas e
sem correlacao, zero metricas Prometheus, `GET /health` nao checava
dependencia nenhuma, o worker era um buraco negro sem HTTP (sem healthcheck
proprio no Railway), o frontend nao tinha error boundary (um crash de render
virava tela branca sem registro em lugar nenhum) e o Playwright nao
capturava console/pageerror nem conseguia correlacionar teste -> request ->
log do servidor. As fases de teste mais dificeis de depurar sao justamente
as assincronas/invisiveis ao browser (execucoes via SSE, ingestao de
conhecimento no worker, custo real de IA) — exatamente onde a falta de
instrumentacao doia mais.

Esta ADR cobre as 8 fases implementadas para resolver isso, entregues e
commitadas incrementalmente (cada fase validada com testes ao vivo contra
API/worker reais antes do commit, nao so typecheck/lint).

## Decisao

Construir a camada em 8 fases, cada uma isolada e testavel:

1. **Logging estruturado** (`apps/api/src/observability/`): `pino` via
   `nestjs-pino`, JSON em producao / `pino-pretty` em dev
   (`LOG_LEVEL`/`LOG_PRETTY`). Redaction restrita a
   `req.headers.{authorization,cookie}` — wildcards genéricos tipo
   `*.value`/`*.token` foram tentados e descartados (ver Dividas).
2. **Correlacao ponta-a-ponta**: `AsyncLocalStorage` (`request-context.ts`)
   com `{requestId, userId, workspaceId, executionId, traceId, jobId, queue,
   testRun}`, injetado em todo log via `mixin`. `x-request-id` nasce no
   `api-client.ts` do frontend, atravessa `queue.add()` (`_ctx` no job data),
   chega no worker (`runJobInContext`) e no envelope de evento SSE.
   `x-test-run` (Fase 7) segue o mesmo caminho, gerado pela fixture do
   Playwright.
3. **Health profundo + heartbeat do worker + eventos de fila**:
   `/health/live` (liveness estatico) e `/health/ready` (Postgres+Redis reais,
   timeout de 1.5s) substituem o `/health` raso anterior (mantido por
   compatibilidade, com campo `checks` aditivo). Worker escreve um heartbeat
   no Redis (TTL 30s) que a API reporta em `/health/ready` sem derrubar o
   proprio status. `@OnWorkerEvent` nos 4 processors loga
   completed/failed/stalled com duracao/tentativas.
4. **Metricas Prometheus** (`prom-client`, registry proprio por processo —
   nao o global, pra sobreviver ao `nest start --watch` sem
   "AlreadyRegisteredError"): `GET /metrics` na API; o worker (sem HTTP
   nativo) ganhou um mini servidor `node:http` (~100 linhas,
   `worker-http.ts`) so pra isso + `/health`. Cobre HTTP
   (`http_request_duration_seconds`), execucao/step/sandbox, fila
   (`queue_jobs_total`, `queue_job_wait_seconds` — este ultimo tambem cobre
   drift de cron na fila `schedules`, ver Dividas), SSE
   (`sse_active_connections`) e IA (populada na Fase 5).
5. **Telemetria de IA + custo persistido**: `packages/ai/src/telemetry.ts`
   (zero deps, `setTelemetryHandler`/`emitTelemetry`) instrumenta
   `getProvider()` uma unica vez (`registry.ts`) para TODAS as chamadas de
   IA da plataforma — nodes de workflow, agentes, RAG, Autocomplete/Copilot/
   Debugger. `AiSuggestion` ganhou `model`/`inputTokens`/`outputTokens`/
   `costUsd`; `analytics.service.ts` soma esse custo (antes invisivel no
   dashboard, que so contava execucao de workflow).
6. **Frontend**: error boundaries (`global-error.tsx`, `(app)/error.tsx`,
   `flows/[id]/error.tsx`), `lib/errors.ts` centralizando `ApiError`/
   `NetworkError`/`TimeoutError`/`errorMessage()` (antes duplicada em ~12
   arquivos), `lib/telemetry.ts` (`window.onerror`/`unhandledrejection` ->
   `POST /telemetry/client-errors`), React Query com toast global
   deduplicado e retry condicional (para de insistir em 400/404),
   `sse-client.ts` com reconexao/backoff/watchdog.
7. **Integracao E2E**: ring buffer de logs em memoria (~2000 entradas por
   processo) + `GET /debug/logs?testRun=` (`OBS_DEBUG_ENDPOINT=1`, nunca em
   producao) — a fixture do Playwright anexa esses logs (API e worker) mais
   console/pageerror/requests-falhos do browser a todo teste que falha.
8. **Grafana local opcional**: `docker compose --profile observability up`
   sobe Prometheus (scrape de `host.docker.internal:3333/3334`) + Grafana
   com datasource e 1 dashboard (`infra/observability/`) ja provisionados —
   nunca sobe com o `up` normal (so Postgres/Redis).

## Alternativas consideradas

- **Agregador de logs externo (Loki/ELK) em vez do ring buffer em memoria**:
  descartado para o ambiente de dev/CI local — exigiria mais um servico
  rodando so pra rodar a suite E2E. O ring buffer resolve o problema real
  (correlacionar teste -> log do servidor) sem infraestrutura extra; nao
  serve como solucao de producao (dados somem no restart, sem retencao).
- **Metrica de IA emitida direto de dentro do worker_thread do sandbox**:
  o modulo `@workflow/ai` roda isolado dentro de cada `worker_thread`
  (ADR-005), sem acesso ao `MetricsService` do processo principal.
  Resolvido com um RPC fire-and-forget de volta ao thread principal (mesmo
  padrao ja usado pelo `log` de node), que reemite o evento onde o handler
  real esta registrado — achado e corrigido durante o teste ao vivo da
  Fase 5 (sem isso, `ai_call_duration_seconds` nunca populava pra chamadas
  de IA dentro de workflows, so as feitas direto pela API).
- **Rate limit do endpoint de telemetria de client via middleware
  generico/Redis**: descartado por excesso — e um endpoint publico, sem
  usuario/workspace pra chavear, e so precisa sobreviver a um client com bug
  em loop, nao coordenar entre processos. Contador em memoria por IP
  (janela fixa de 60s) resolve com uma dezena de linhas.
- **`transport` do pino para o ring buffer**: pino so aceita `transport` OU
  `stream`, nunca os dois. Resolvido com `pino.multistream` combinando o
  destino normal (pretty/JSON) com o ring buffer.

## Consequencias

### O que melhora

- Qualquer execucao (workflow, ingestao, chamada de IA) tem seu
  `requestId`/`traceId` rastreavel do browser ao log do worker.
- Um teste E2E que falha vem com console do browser + logs correlacionados
  do servidor anexados automaticamente — antes era "expect falhou", sem
  mais contexto nenhum.
- Custo de IA das 4 features de plataforma (antes invisivel) agora soma no
  Analytics.
- `docker compose --profile observability up` da um dashboard funcional em
  minutos, sem custo de infra paga, pra qualquer sessao de debug local.

### Dividas documentadas (deliberadas, nao esquecidas)

- **`memoryMb` de `ExecutionStep` mede o heap do PROCESSO PRINCIPAL no
  momento do snapshot (`engine.service.ts`), nao o heap real do
  `worker_thread` isolado que executou aquele node especifico** — por isso
  NUNCA foi exportado como metrica Prometheus (seria enganoso: um host com
  varios workers concorrentes mostraria o mesmo numero pra nodes muito
  diferentes). Pra medir memoria real por node seria preciso o
  `worker_thread` reportar seu proprio `process.memoryUsage()` via RPC antes
  de terminar — nao feito porque o timeout duro (`worker.terminate()`) pode
  matar a thread antes dela conseguir responder.
- **Producao (Railway) nao tem nada fazendo scrape de `/metrics` hoje** — os
  dois processos EXPOEM as metricas corretamente, mas nenhum Prometheus
  externo esta configurado pra coletar. Opcoes pra fechar isso, nao
  decididas ainda: (a) Grafana Cloud free tier com `remote_write` a partir
  de um Prometheus rodando como servico extra no Railway; (b) Railway nao
  tem um addon nativo de Prometheus — precisaria de um servico proprio na
  mesma rede privada do projeto; (c) aceitar que producao fica so com logs
  estruturados (ja bom o suficiente pro volume atual) e revisitar isso
  quando o custo de um incidente sem metricas realmente doer.
- **Drift de cron**: nao existe uma metrica dedicada
  `scheduler_fire_drift_seconds` (estava no plano original) — consolidada em
  `queue_job_wait_seconds{queue="schedules"}`, ja que `job.timestamp` de um
  repeatable job do BullMQ e exatamente o horario previsto de disparo, entao
  o tempo de espera ate `job.processedOn` JA captura o drift sem precisar de
  uma metrica separada. Simplificacao deliberada, nao uma lacuna.
- **Replay de eventos SSE fora de escopo**: um cliente que conecta no meio
  de uma execucao (ou reconecta apos queda, Fase 6) so recebe eventos daí
  pra frente — nao ha buffer/replay do que aconteceu antes da conexao atual
  abrir. Para uma execucao curta isso raramente importa (o cliente pode
  buscar o estado atual via `GET /executions/:id`), mas para uma execucao
  longa com um consumidor que caiu e reconectou, os eventos perdidos no meio
  ficam mesmo perdidos do stream (o registro em si nao se perde — steps e
  logs continuam gravados no Postgres, so o STREAM ao vivo nao faz replay).
  Resolver isso exigiria armazenar um historico de eventos por execucao no
  Redis com replay por `Last-Event-ID`, adiado por nao ser um problema
  observado na pratica ainda.
- **Redact de log deliberadamente estreito**: `req.headers.{authorization,
  cookie}` apenas. Wildcards mais amplos (`*.password`, `*.value`, etc.)
  foram tentados na Fase 1 e causaram um falso positivo real (um node
  `logic.log` com payload `{ value }` teve o proprio conteudo do usuario
  redigido). Node de automacao lida com dado arbitrario de negocio — um
  campo chamado "token" ali pode nao ser credencial nenhuma. Se um payload
  especifico precisar de redaction no futuro, o caminho e um path exato
  (`payload.apiKey`), nunca um wildcard largo.
