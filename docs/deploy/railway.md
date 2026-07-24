# Deploy no Railway (API + Worker) — Fase 10

Config preparada, nada provisionado ainda (ver ADR-008). Este guia e o passo a
passo para quando voce conectar a conta Railway.

## Visao geral

Uma unica imagem Docker (`apps/api/Dockerfile`), **dois servicos** no Railway
apontando pro mesmo repo/imagem, cada um com um Start Command diferente:

| Servico  | Start Command                     | HTTP? | Healthcheck |
|----------|------------------------------------|-------|-------------|
| `api`    | `node dist/src/main.js` (padrao)   | Sim (porta `$PORT`, default 3333) | `GET /health` |
| `worker` | `node dist/src/worker.main.js`     | Nao (`createApplicationContext`, sem listener) | Nenhum (ou "Restart on crash" apenas) |

Mais Postgres (`pgvector/pgvector:pg16` — usar o plugin Postgres do Railway ou
um serviço com essa imagem) e Redis (plugin Redis do Railway).

## Passo a passo

1. **Criar o projeto** no Railway a partir deste repo (branch `main`).
2. **Adicionar Postgres e Redis** (plugins do Railway, ou servicos com as
   imagens do `docker-compose.dev.yml`). Copiar as connection strings.
3. **Servico `api`** (criado automaticamente ao conectar o repo):
   - Settings → Build → Dockerfile Path: `apps/api/Dockerfile` (ja e o default
     via `railway.json` na raiz).
   - Settings → Deploy → Start Command: deixar o padrao (`node dist/src/main.js`).
   - Variables: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`
     (ou o nome usado em `apps/api/.env`), demais chaves de API de IA/integracoes.
   - Uma migracao (`prisma migrate deploy`) deve rodar antes do primeiro boot —
     via um "Release Command" no servico `api` (Settings → Deploy → Release
     Command: `pnpm --filter @workflow/api exec prisma migrate deploy`). Rodar
     so no `api`, nunca no `worker` (evita duas migracoes concorrentes).
4. **Servico `worker`** (New Service → mesmo repo, mesma branch):
   - Settings → Build → Dockerfile Path: `apps/api/Dockerfile` (mesma imagem).
   - Settings → Deploy → Start Command: `node dist/src/worker.main.js`
     (sobrescreve o padrao do `railway.json`).
   - Settings → Deploy → Healthcheck Path: deixar vazio/desabilitado — o
     worker nao serve HTTP.
   - Variables: as mesmas do `api` (`DATABASE_URL`, `REDIS_URL`, chaves de IA/
     integracoes) — sem Release Command (a migracao ja roda no `api`).
   - Opcional: concorrencia por fila via env (`EXECUTIONS_CONCURRENCY`,
     `INGESTION_CONCURRENCY`, `MCP_HEALTH_CONCURRENCY`, `SCHEDULES_CONCURRENCY`)
     e limites do sandbox (`NODE_SANDBOX_TIMEOUT_MS`, `NODE_SANDBOX_MEMORY_MB`).
5. **Escalar horizontalmente**: aumentar o numero de instancias do servico
   `worker` no Railway (Settings → Deploy → Replicas, ou via autoscaling se
   disponivel no plano) conforme a profundidade da fila. Acompanhar
   `GET /health/queues` (servido pelo `api`) para decidir quando escalar —
   `waiting`/`oldestWaitingMs` altos e persistentes indicam fila represada.

## Variaveis de ambiente relevantes (Fase 10)

| Variavel | Default | Efeito |
|---|---|---|
| `EXECUTIONS_CONCURRENCY` | 5 | Execucoes de workflow processadas em paralelo por instancia de worker |
| `INGESTION_CONCURRENCY` | 2 | Documentos de knowledge base processados em paralelo |
| `MCP_HEALTH_CONCURRENCY` | 1 | Health checks MCP em paralelo |
| `SCHEDULES_CONCURRENCY` | 5 | Disparos de cron processados em paralelo |
| `NODE_SANDBOX_TIMEOUT_MS` | 30000 | Timeout duro por node (worker.terminate()) |
| `NODE_SANDBOX_MEMORY_MB` | 256 | Limite de heap por node (worker_threads resourceLimits) |
| `ORPHAN_EXECUTION_THRESHOLD_MS` | 600000 (10min) | Ha quanto tempo uma execucao "running" e considerada orfa no boot do worker |
| `AI_RATE_LIMIT_<PROVIDER>_RPM` | 60 (600 p/ ollama) | Limite de requisicoes/minuto por provider de IA, compartilhado entre todos os workers via Redis |

## Por que uma imagem so, dois servicos

Ver ADR-008 (`docs/adr/008-worker-separado.md`): o worker roda o mesmo
codebase do `@workflow/api`, com um entrypoint proprio
(`apps/api/src/worker.main.ts`) que sobe so os consumidores de fila, sem HTTP.
Isso evita duplicar dependencias/build entre dois pacotes e mantem o deploy
de fato independente (matar o `worker` nao derruba o `api`, e vice-versa).
