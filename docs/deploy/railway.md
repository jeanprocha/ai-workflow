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

### Hardening HTTP (H1.1)

So valem pro servico `api` (unico com HTTP publico — o `worker` nao serve
requisicoes de fora, ver `startWorkerHttpServer` que so expoe health/metrics
internos):

| Variavel | Default | Efeito |
|---|---|---|
| `CORS_ORIGINS` | *(nao setada)* | Lista de origins permitidas, separadas por virgula (ex.: `https://web-xxx.vercel.app`). **Sem essa env, o CORS fica aberto** (`origin: true`) com um aviso no log de boot — configurar antes do proximo deploy pra travar de fato. |
| `THROTTLE_LIMIT` | 100 (2000 fora de producao) | Requests/janela por IP, limite global (`ThrottlerGuard`) |
| `THROTTLE_TTL_MS` | 60000 | Janela do rate limit, em ms |
| `THROTTLE_AUTH_LIMIT` | 5 (1000 fora de producao) | Requests/janela por IP, so pra `/auth/login`, `/auth/register`, `/auth/refresh` |

`trust proxy` e `helmet` nao tem env — sempre ativos (o Railway ja fica atras
de proxy, entao `req.ip` so reflete o IP real do cliente com `trust proxy`
habilitado; sem isso todo tráfego apareceria com o mesmo IP do proxy pro
rate limiter).

### Sentry (H1.4)

Valem pros dois servicos (`api` e `worker` — cada um reporta pro Sentry
independente, ambos usam o mesmo projeto). **Sem `SENTRY_DSN`, o SDK fica
desabilitado** (`Sentry.init` vira no-op) — nada e enviado, nenhum erro de
boot.

| Variavel | Default | Efeito |
|---|---|---|
| `SENTRY_DSN` | *(nao setada = desabilitado)* | DSN do projeto Sentry |
| `SENTRY_ENVIRONMENT` | `NODE_ENV` ou `development` | Tag `environment` nos eventos |
| `SENTRY_RELEASE` | *(nao setada)* | Tag `release` — sugestao: SHA do deploy |
| `SENTRY_TRACES_SAMPLE_RATE` | 0.1 | Fracao de requests com tracing de performance |

Captura: 5xx e erros nao-HTTP em `AllExceptionsFilter` (api); falha de
execucao de workflow no ponto unico de finalizacao do engine (worker).
Tags de correlacao: `requestId`, `workspaceId`, `userId`, `executionId`
(api); `executionId`, `workflowId`, `workspaceId`, `triggerType` (worker).

### Email de sistema + reset de senha (H1.5)

Vale pros dois servicos: `api` (reset de senha) e `worker` (alerts de falha,
H1.6 — ver secao seguinte, usa o mesmo `MailerModule`). **Sem `SMTP_HOST`, o
`MailerService` fica em modo no-op** (loga um aviso e nao envia nada) — nao
quebra o boot em nenhum dos dois.

| Variavel | Default | Efeito |
|---|---|---|
| `SMTP_HOST` | *(nao setada = desabilitado)* | Host do servidor SMTP |
| `SMTP_PORT` | 1025 (porta do Mailpit em dev) | Porta do SMTP |
| `SMTP_SECURE` | `false` | `true` pra TLS implicito (porta 465 tipicamente) |
| `SMTP_USER` / `SMTP_PASS` | *(nao setadas)* | Auth do SMTP — se o provider nao exigir (ex.: Mailpit local), deixar vazias |
| `EMAIL_FROM` | `no-reply@workflow.local` | Remetente dos emails de sistema |
| `WEB_URL` | `http://localhost:3000` | Base do link de reset (`{WEB_URL}/reset-password?token=...`) e da URL de execucao nos alertas — em producao, a URL do Vercel |

Em dev local, o Mailpit (`docker-compose.dev.yml`) captura tudo — UI em
`http://localhost:8025`, sem precisar de provedor externo. Em producao,
qualquer SMTP (Resend, SES, Gmail com senha de app etc.) funciona — e
transporte generico via `nodemailer`, sem SDK proprietario.

### Alerting de falhas de execucao (H1.6)

So o servico `worker` (e quem finaliza execucoes). Config por workspace via
`GET`/`PUT /workspaces/alert-settings` (UI em Settings → Alertas); sem
nenhuma configuracao salva, o default e email habilitado + sem webhook.

| Variavel | Default | Efeito |
|---|---|---|
| `ALERT_THROTTLE_MINUTES` | 10 | Anti-spam: no maximo 1 alerta por workflow nesta janela, mesmo com varias falhas seguidas |

Canais: email (`MailerModule`, ver secao acima — precisa de `SMTP_HOST`) pra
todos os membros do workspace, e/ou `POST` JSON pra um webhook generico
(compativel com Slack/Discord/Teams via webhook de entrada). Um alerta
falhando (SMTP fora do ar, webhook offline) nunca derruba a execucao —
`AlertsService.notifyExecutionFailed` engole o proprio erro.

Reset de senha: token bruto (32 bytes) so existe no link enviado; o banco
guarda so o hash (sha256), com TTL de 30min e uso unico. **Limitacao
conhecida**: refresh tokens sao JWT stateless — um reset de senha NAO
invalida sessoes (refresh tokens) ja emitidas antes dele. Revogacao de
sessao fica pro RBAC (H3).

## Escalar

Aumentar replicas do `worker` (Settings → Deploy → Replicas) conforme a
profundidade da fila. `GET /health/queues` (servido pelo `api`) mostra
`waiting`/`oldestWaitingMs` — altos e persistentes indicam fila represada.
