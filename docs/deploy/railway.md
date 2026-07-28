# Deploy no Railway (API + Worker)

Ambiente **provisionado e no ar**. O frontend roda no Vercel (ver
`docs/deploy/vercel.md`).

| | |
|---|---|
| Projeto | `ai-workflow` (`713c8fcf-f54c-47b6-9c0a-2895dc0c84dc`) |
| Ambiente | `production` (`9d3a89a5-9899-4b0a-bbcc-993a9b00f955`) |
| Servicos | `api`, `worker` |
| Databases | Postgres (`postgres-volume`), Redis (`redis-volume`) |
| URL da API | `https://api-production-cb36.up.railway.app` |

## Visao geral

Uma unica imagem Docker (`apps/api/Dockerfile`, apontada pelo `railway.json`
na raiz), **dois servicos** com Start Commands diferentes:

| Servico  | Start Command                     | HTTP? | Healthcheck |
|----------|------------------------------------|-------|-------------|
| `api`    | `node dist/src/main.js` (padrao)   | Sim (porta `$PORT`, default 3333) | `GET /health` |
| `worker` | `node dist/src/worker.main.js`     | Nao (`createApplicationContext`, sem listener) | Nenhum ("Restart on crash" apenas) |

Por que uma imagem so: ver ADR-008 (`docs/adr/008-worker-separado.md`).

## Deploy

Nao ha repo git conectado — o deploy e feito por upload direto da pasta local
com a CLI, a partir da **raiz do monorepo**:

```bash
railway up --service api --detach
```

```bash
railway up --service worker --detach
```

Acompanhar ate terminar (`BUILDING` → `SUCCESS`):

```bash
railway deployment list --service api
```

O `--detach` e importante em uso automatizado: sem ele a CLI fica streamando
log de build e nunca retorna.

### Migracoes

O servico `api` tem um **Release Command** configurado
(`pnpm --filter @workflow/api exec prisma migrate deploy`) que roda a cada
deploy, antes do boot. Nao ha passo manual: subir o `api` ja aplica as
migracoes pendentes. Confirmado no deploy de 2026-07-28 ("16 migrations found",
6 aplicadas, "All migrations have been successfully applied").

O `worker` **nao** tem Release Command de proposito — duas migracoes
concorrentes na mesma base dariam corrida.

### Verificacao pos-deploy

```bash
curl -s https://api-production-cb36.up.railway.app/health
```

Deve responder `{"status":"ok",...}` com `checks.postgres.ok` e
`checks.redis.ok` em `true`. Para o worker (que nao serve HTTP), conferir no
log a linha `Worker iniciado — consumindo filas: executions, ingestion,
mcp-health, schedules`:

```bash
railway logs --service worker --deployment --lines 60
```

## Acessar o Postgres de producao

O host (`postgres.railway.internal`) so resolve **dentro** da rede do Railway —
`psql` direto da maquina local da "conexao recusada". Nao e preciso criar
proxy TCP publico: a CLI tunela por SSH.

Pre-requisito, uma vez por maquina:

```bash
railway ssh keys add -k ~/.ssh/id_ed25519.pub -n ai-workflow-deploy
```

Depois, shell interativo (ou receber SQL por stdin):

```bash
railway connect Postgres --ssh
```

Para apontar um cliente externo (TablePlus, DBeaver) sem abrir client:

```bash
railway connect Postgres --tunnel-only
```

## Variaveis de ambiente

Nomes conferem com `apps/api/.env`. Ja setadas no servico `api`:
`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `SECRETS_ENCRYPTION_KEY`.

> `SECRETS_ENCRYPTION_KEY` de producao e **diferente** da de dev (ADR-007).
> Isso significa que o `credentials.encrypted_data` **nao e portavel** entre
> ambientes: copiar a linha crua de dev pra producao gera um blob que nao
> descriptografa. Credencial migrada tem que ser recriada pela UI
> (Settings → Conexoes) no ambiente destino, com o mesmo **nome** — os nodes
> referenciam credencial por nome, nao por id.

Ajuste fino de fila e sandbox (opcionais, valem pro `worker`):

| Variavel | Default | Efeito |
|---|---|---|
| `EXECUTIONS_CONCURRENCY` | 5 | Execucoes de workflow em paralelo por instancia |
| `INGESTION_CONCURRENCY` | 2 | Documentos de knowledge base em paralelo |
| `MCP_HEALTH_CONCURRENCY` | 1 | Health checks MCP em paralelo |
| `SCHEDULES_CONCURRENCY` | 5 | Disparos de cron em paralelo |
| `NODE_SANDBOX_TIMEOUT_MS` | 30000 | Timeout duro por node (`worker.terminate()`) |
| `NODE_SANDBOX_MEMORY_MB` | 256 | Limite de heap por node (`resourceLimits`) |
| `ORPHAN_EXECUTION_THRESHOLD_MS` | 600000 | Idade pra considerar orfa uma execucao "running" no boot |
| `AI_RATE_LIMIT_<PROVIDER>_RPM` | 60 (600 p/ ollama) | Req/min por provider de IA, compartilhado entre workers via Redis |

## Escalar

Aumentar replicas do `worker` (Settings → Deploy → Replicas) conforme a
profundidade da fila. `GET /health/queues` (servido pelo `api`) mostra
`waiting`/`oldestWaitingMs` — altos e persistentes indicam fila represada.
