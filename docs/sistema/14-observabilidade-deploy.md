# Observabilidade, testes e deploy

> Última revisão: 2026-08-03 · commit `93468bf`

## O que faz

Uma plataforma de automação é difícil de depurar por natureza: o que interessa acontece longe do browser — dentro de uma fila, num worker separado, num `worker_thread` isolado, numa chamada de IA que custa dinheiro. Este domínio existe para que qualquer coisa que aconteça ali seja **observável do lado de fora**, e para que o caminho do código até produção seja repetível.

O eixo da observabilidade é a **correlação**. Um `x-request-id` nasce no `api-client.ts` do frontend, entra no contexto da request na API (via `AsyncLocalStorage`), viaja dentro do payload do job quando algo é enfileirado, é restaurado no worker que processa esse job e reaparece no envelope de cada evento SSE. Todo log estruturado — pino, JSON em produção, `pino-pretty` em dev — carrega esse contexto automaticamente, junto com `userId`, `workspaceId`, `executionId`, `traceId`, `jobId` e `queue`. O resultado prático é que "por que essa execução falhou?" vira um filtro por id, não uma arqueologia.

Em cima disso há três superfícies de leitura. **Métricas Prometheus** em `/metrics`, cobrindo HTTP, execução, step, sandbox, fila, SSE e IA — cada processo tem seu próprio registry (não o global do `prom-client`), detalhe que existe para sobreviver ao `--watch` sem estourar `AlreadyRegisteredError`. **Health checks** em quatro níveis: `/health/live` é estático (o processo respira), `/health/ready` toca Postgres e Redis de verdade com timeout curto e reporta o heartbeat do worker lido do Redis, `/health` é o endpoint raso original mantido por compatibilidade com campo `checks` aditivo, e `/health/queues` expõe a contagem de jobs por estado. E **telemetria de erro de client**: o browser reporta `window.onerror` e promises rejeitadas num endpoint público com rate limit em memória por IP. Existe ainda `/debug/logs`, um ring buffer em memória consultável por `testRun` — só registrado quando `OBS_DEBUG_ENDPOINT=1`, nunca em produção; é dele que a fixture do Playwright puxa os logs do servidor para anexar a um teste que falhou.

O worker é o caso especial: sendo um `NestFactory.createApplicationContext` sem HTTP, ele não teria como expor nada. Ganhou por isso um mini servidor `node:http` de ~100 linhas (`worker-http.ts`) que serve exatamente `/metrics` e `/health`, na porta 3334 por padrão. É o que permite ao Railway ter healthcheck do worker e ao Prometheus fazer scrape dos dois processos.

Sentry roda nos três lugares — API, worker e web (H1.4). Nos dois primeiros o init precisa ser o primeiro import do entrypoint, porque o SDK instrumenta módulos carregados **depois** dele; sem `SENTRY_DSN` o init vira no-op, então dev e teste nunca reportam nada por engano.

Do lado de deploy, a topologia é simples e vale entender antes de abrir os docs de procedimento: **API e worker são dois serviços do Railway rodando a mesma imagem Docker**. O `railway.json` aponta para `apps/api/Dockerfile`, cujo `CMD` padrão sobe a API; o serviço do worker apenas sobrescreve o start command para o outro entrypoint. Mesmo build, dois processos, escala independente — matar um worker não afeta a API nem os outros workers. O frontend vai para a Vercel, separado. Os passos concretos de cada um (variáveis, migrações, verificação pós-deploy) vivem em `docs/deploy/railway.md` e `docs/deploy/vercel.md` e não são repetidos aqui.

O CI roda em dois jobs paralelos. O primeiro é a cadeia estática — lint, typecheck, build, test (Jest via Turborepo). O segundo, `e2e-smoke` (H1.3), é independente porque precisa de um ambiente completo de pé: Postgres com pgvector e Redis como service containers, migrações aplicadas, seed rodado, API, worker e web buildados e iniciados, e então o subconjunto de specs marcado `@smoke`. Quando falha, anexa o report do Playwright e os logs dos três processos como artefatos. Deliberadamente **não** define `NODE_ENV=production`, para que os limites do throttler fiquem no default folgado e o próprio CI não se auto-rate-limite fazendo login em sequência.

A suíte E2E completa (45 specs em `apps/e2e/tests/`, dos quais 13 marcados `@smoke`) fica fora do `pnpm test` e nunca roda inteira no CI — o job `e2e-smoke` executa só o recorte `@smoke`. Rodar tudo exige serviços reais e é sempre um comando explícito e local. O plano de testes tem duas frentes deliberadas: o automatizado cobre o que dá para afirmar com certeza, e roteiros manuais em `docs/testing/manual/` cobrem o que exige julgamento humano.

## Onde vive

| Arquivo                                                        | Papel                                                                                         |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `apps/api/src/observability/logger.config.ts`                  | Configuração do pino/nestjs-pino; `pino.multistream` combinando destino normal + ring buffer. |
| `apps/api/src/observability/request-context.ts`                | `AsyncLocalStorage` com o contexto de correlação injetado em todo log.                        |
| `apps/api/src/observability/request-id.middleware.ts`          | Origem/propagação do `x-request-id`.                                                          |
| `apps/api/src/observability/auth-context.interceptor.ts`       | Adiciona `userId`/`workspaceId` ao contexto.                                                  |
| `apps/api/src/observability/metrics.service.ts`                | Todas as métricas declaradas (registry próprio do processo).                                  |
| `apps/api/src/observability/metrics.controller.ts`             | `GET /metrics`; atualiza `queue_depth` no momento do scrape.                                  |
| `apps/api/src/observability/http-metrics.interceptor.ts`       | Duração e contagem de requests HTTP.                                                          |
| `apps/api/src/observability/all-exceptions.filter.ts`          | Filtro global de exceção; reporta ao Sentry.                                                  |
| `apps/api/src/observability/log-ring-buffer.ts`                | ~2000 entradas em memória por processo, consultáveis por `testRun`/`requestId`/`level`.       |
| `apps/api/src/observability/debug.controller.ts`               | `GET /debug/logs` e `/debug/echo`; só registrado com `OBS_DEBUG_ENDPOINT=1`.                  |
| `apps/api/src/observability/worker-http.ts`                    | Mini servidor HTTP do worker (`WORKER_PORT ?? PORT ?? 3334`).                                 |
| `apps/api/src/observability/queue-events.ts`                   | `@OnWorkerEvent` — loga completed/failed/stalled com duração e tentativas.                    |
| `apps/api/src/observability/ai-telemetry.bridge.ts`            | Liga os eventos de `packages/ai` às métricas do processo.                                     |
| `apps/api/src/health/health.controller.ts`                     | `/health`, `/health/live`, `/health/ready`, `/health/queues`.                                 |
| `apps/api/src/worker/worker-heartbeat.service.ts`              | Heartbeat do worker no Redis (TTL 30s), lido por `/health/ready`.                             |
| `apps/api/src/telemetry/telemetry.controller.ts`               | `POST /telemetry/client-errors`, público, com rate limit em memória por IP.                   |
| `apps/api/src/instrument.ts`                                   | Init do Sentry — primeiro import de `main.ts` e `worker.main.ts`.                             |
| `apps/web/src/instrumentation.ts`, `instrumentation-client.ts` | Init do Sentry no Next (servidor e browser).                                                  |
| `apps/api/Dockerfile`                                          | Imagem única multi-stage; `CMD` = API, worker sobrescreve o start command.                    |
| `railway.json`                                                 | Builder `DOCKERFILE` apontando para o Dockerfile da API.                                      |
| `docker-compose.dev.yml`                                       | Postgres (pgvector), Redis, Mailpit + perfil opcional `observability`.                        |
| `infra/observability/prometheus.yml`                           | Scrape de `host.docker.internal:3333` e `:3334`.                                              |
| `infra/observability/grafana/`                                 | Datasource e dashboard (`workflow-overview.json`) provisionados.                              |
| `.github/workflows/ci.yml`                                     | Jobs `build` e `e2e-smoke`.                                                                   |
| `apps/e2e/`                                                    | Playwright: `playwright.config.ts`, `global-setup.ts`, `helpers/`, `fixtures/`, `tests/`.     |

**Rotas de operação**

| Rota                            | O que faz                                                                  |
| ------------------------------- | -------------------------------------------------------------------------- |
| `GET /metrics`                  | Exposição Prometheus (API na 3333, worker na 3334). Pública.               |
| `GET /health/live`              | Liveness estático — o processo está de pé.                                 |
| `GET /health/ready`             | Readiness real: Postgres + Redis (timeout 1.5s) + heartbeat do worker.     |
| `GET /health`                   | Endpoint raso original, mantido por compatibilidade, com `checks` aditivo. |
| `GET /health/queues`            | Contagem de jobs por estado em quatro das cinco filas (ver Limitações).    |
| `POST /telemetry/client-errors` | Recebe erros não tratados do browser. Público, rate-limitado por IP.       |
| `GET /debug/logs`               | Ring buffer filtrado; só existe com `OBS_DEBUG_ENDPOINT=1`.                |
| `ALL /debug/echo`               | Eco determinístico da request; alvo dos testes do node HTTP.               |

**Portas locais**

| Porta       | O quê                                          |
| ----------- | ---------------------------------------------- |
| 3000        | Web (Next dev).                                |
| 3333        | API (HTTP + `/metrics`).                       |
| 3334        | Worker (`/metrics` + `/health`).               |
| 5433 / 6380 | Postgres / Redis do `docker-compose.dev.yml`.  |
| 1025 / 8025 | Mailpit: SMTP / UI e API HTTP.                 |
| 9090 / 3005 | Prometheus / Grafana (perfil `observability`). |

## Como se conecta

- Este domínio é transversal: instrumenta todos os outros sem que eles saibam.
- [Engine de execução](01-engine-execucao.md) — origem das métricas de execução, step e sandbox, e dos eventos de fila. A telemetria de IA precisou de um RPC de volta do `worker_thread` para o thread principal, já que o sandbox não enxerga o `MetricsService`.
- [Web e editor](13-web-editor.md) — ponto de partida do `x-request-id`, dos error boundaries e da telemetria de erro de client.
- [Autenticação e workspaces](12-auth-workspaces.md) — `userId`/`workspaceId` entram no contexto de log; `/metrics`, `/health*` e `/telemetry/client-errors` são `@Public()`.
- [IA da plataforma](11-ai-plataforma.md) — o custo de IA das features de plataforma passou a somar no Analytics por causa da instrumentação de `getProvider()`.
- [Triggers e scheduler](06-triggers-scheduler.md) — drift de cron é medido por `queue_job_wait_seconds{queue="schedules"}`, sem métrica dedicada.

## Decisões e histórico

- [ADR-010](../adr/010-observabilidade.md) — a decisão-mãe deste domínio: as 8 fases da camada de observabilidade, as alternativas descartadas e uma lista longa de dívidas deliberadas. Leitura obrigatória antes de mexer em qualquer coisa aqui.
- [ADR-008](../adr/008-worker-separado.md) — por que existem dois entrypoints no mesmo codebase, e por que isso vira dois serviços na mesma imagem.
- [ADR-005](../adr/005-isolamento-execucao-nodes.md) — o isolamento por `worker_thread` que explica tanto o custo de latência medido no load test quanto a impossibilidade de medir memória real por node.
- [docs/deploy/railway.md](../deploy/railway.md) — procedimento de deploy da API e do worker, variáveis de ambiente, migrações, verificação pós-deploy, hardening HTTP (H1.1), Sentry (H1.4), email (H1.5) e alerting (H1.6).
- [docs/deploy/vercel.md](../deploy/vercel.md) — procedimento de deploy do frontend.
- [docs/testing/plano-de-testes.md](../testing/plano-de-testes.md) — como rodar a suíte, convenções, diagnóstico de falhas e o checklist de pré-deploy.
- [docs/perf/fase-10-load-test.md](../perf/fase-10-load-test.md) — o único teste de carga registrado.
- **Não há ADR** sobre a estratégia de CI (os dois jobs, o recorte `@smoke`, o `NODE_ENV` deliberadamente não-produção): as razões vivem em comentários dentro do próprio `ci.yml`.

## Limitações e fora de escopo

- **Produção não coleta métrica nenhuma.** API e worker expõem `/metrics` corretamente, mas não há Prometheus configurado no Railway fazendo scrape. Hoje produção tem só logs estruturados e Sentry. As opções para fechar isso estão listadas no ADR-010 e nenhuma foi escolhida.
- **O Grafana local é o único consumo real de métricas** e é opt-in: só sobe com `docker compose --profile observability up`.
- **O ring buffer de logs não é solução de produção** — memória, sem retenção, some no restart. Existe para o Playwright correlacionar teste → log do servidor.
- **Armadilha local: `pnpm dev` não sobe o worker.** O script `dev` de `@workflow/api` é só a API; o worker precisa de `pnpm --filter @workflow/api dev:worker` num terminal separado. Sem ele, execuções ficam eternamente enfileiradas, ingestão de conhecimento nunca conclui e o cron nunca dispara — tudo silenciosamente, porque a API aceita o job normalmente. O sintoma indireto é o `/health/ready` reportando o heartbeat do worker ausente.
- **`docs/perf/fase-10-load-test.md` está defasado.** É de 2026-07-24, anterior às mudanças de engine (H2: continue-on-error, error workflow, pausa durável, node de código). Os números (P50 ~9s para 30 execuções de 2 nodes) medem uma engine que não é mais esta, numa máquina de desenvolvimento que não representa o Railway. Trate como ordem de grandeza histórica, não como baseline. Não houve novo teste de carga depois.
- **Os roteiros manuais pararam na fase 11.** `docs/testing/manual/` vai de `01-auth` a `11-busca-scheduler`. As fases 12 (Chat), 13 (Node HTTP white-label) e 14 (Conexões multi-campo) têm suíte automatizada e constam do roadmap do plano de testes, mas **não têm roteiro manual companheiro** — a convenção declarada no próprio plano ("doc manual companheiro em `docs/testing/manual/<NN>-<fase>.md`") deixou de ser seguida. Pior: todo o H2 (aprovação humana, templates CRUD, publicar como API, continue-on-error/error workflow, node de código) tem specs E2E mas não aparece nem na tabela de roadmap do plano de testes — o documento também está desatualizado.
- **O CI só roda o recorte `@smoke`** (13 dos 45 arquivos de spec). A suíte completa nunca roda automaticamente; é sempre execução local manual.
- **`/health/queues` não enxerga a fila `approvals`.** O endpoint lista `executions`, `ingestion`, `mcp-health` e `schedules` (`apps/api/src/health/health.controller.ts:149-152`); a fila criada na entrega mais recente ficou de fora. Um sweeper de aprovações entupido é invisível ali.
- **Sem tracing distribuído de verdade.** Existe um `traceId` no contexto de log, mas não há OpenTelemetry nem spans — a correlação é por campo em log, não por trace navegável.
- **Sem replay de eventos SSE**: um cliente que reconecta no meio de uma execução perde os eventos do intervalo. O registro persistido (steps e logs) não se perde, só o stream ao vivo.
- **`memoryMb` de `ExecutionStep` mede o heap do processo principal, não o do `worker_thread`** que rodou o node — por isso nunca foi exportado como métrica.
- **Redact de log é deliberadamente estreito** (`req.headers.authorization` e `cookie`, só). Wildcards largos foram tentados e descartados por redigirem payload legítimo de usuário. Um payload que precise de redaction no futuro deve usar path exato, nunca wildcard.
- **Sem rollback automatizado, sem blue/green, sem migração reversível.** Migrações são `prisma migrate deploy` aplicadas para frente; desfazer é procedimento manual.
- **Sem SLOs, alertas de infraestrutura ou on-call.** O único alerting existente é o de falha de execução por workspace (H1.6), que é feature de produto, não monitoramento de plataforma.
