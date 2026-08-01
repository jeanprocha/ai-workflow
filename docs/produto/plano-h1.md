# Plano H1 — Confiável e vendável

Data: 2026-07-29. Execução do horizonte H1 de `base-evolucao.md` §5.
Pré-requisito concluído: correções C1–C6 (§3.1, todas ✅).

**Critério de saída do H1: dá pra colocar cliente pagante sem sustos.**

Decisões tomadas no discovery (2026-07-29):

- **Email de sistema**: SMTP genérico via env vars (nodemailer, que já é dep do
  monorepo) — sem SDK de provedor; trocar de provedor = trocar env no Railway.
- **Alerting MVP**: config por workspace com email de sistema para membros
  e/ou webhook URL genérica (cobre Slack/Discord/Telegram via incoming
  webhooks sem UI dedicada).

Dependências entre fases: H1.1–H1.4 são independentes entre si.
H1.5 cria o módulo de email que H1.6 reusa — executar 5 antes de 6.

---

## Fase H1.1 — Hardening HTTP ✅ concluída (2026-07-29)

Tudo em `apps/api` (ponto único: `main.ts` + `app.module.ts`).

- [x] `@nestjs/throttler` global: limite generoso por padrão (100 req/min por
      IP em produção, 2000 fora dela), estrito em `/auth/login`,
      `/auth/register`, `/auth/refresh` (5 req/min em produção; endpoints
      públicos de reset ficam pro H1.5, que reusa o mesmo `@Throttle`)
- [x] Limites configuráveis por env (`THROTTLE_*`), folgados quando `NODE_ENV`
      != production para não quebrar a suíte E2E local
- [x] `helmet` no bootstrap (`contentSecurityPolicy: false` — a API não serve
      HTML; demais headers ativos e confirmados numa resposta real)
- [x] CORS: origin via env `CORS_ORIGINS` (lista separada por vírgula).
      **Decisão de execução**: sem a env setada, mantém `origin: true` (aberto,
      comportamento pré-H1.1) com warning no boot, em vez de travar direto —
      evita quebrar produção antes do próximo deploy que define a env.
      `exposedHeaders: x-request-id` preservado
- [x] `trust proxy` no Express (`apps/api/src/main.ts`)
- [x] `chat-rate-limit.ts`: mantido como camada extra específica de domínio
      (30 msgs/min, mensagem de erro voltada ao visitante), empilhado sob o
      throttler global — decisão documentada no próprio arquivo
- [x] Env novas documentadas em `docs/deploy/railway.md`
      (`CORS_ORIGINS`, `THROTTLE_LIMIT`, `THROTTLE_TTL_MS`,
      `THROTTLE_AUTH_LIMIT`) — ainda não setadas no Railway (ação do usuário
      antes do próximo deploy)
- [x] Verificação manual (curl, API local com `THROTTLE_AUTH_LIMIT=5`):
      6ª tentativa de `/auth/login` em 60s retorna `429` com `Retry-After`;
      headers do helmet presentes em qualquer resposta
- [ ] **Não feito**: teste E2E automatizado de 429. Exigiria rodar a suíte
      com `THROTTLE_AUTH_LIMIT` baixo, o que quebraria os ~260 outros testes
      (fazem login/registro em série/paralelo). Preso à mesma tensão do H1.3
      (isolar um ambiente com config diferente) — revisitar junto daquela
      fase, com servidor dedicado e env própria

## Fase H1.2 — Testes unitários (engine, expressões, crypto) ✅ concluída (2026-07-30)

`pnpm test` na raiz saiu de 1 teste (scaffold do Nest) pra **59 testes reais**
em 3 packages.

- [x] **crypto** (8 testes): roundtrip, payload malformado, authTag/ciphertext
      adulterado, chave ausente, chaves diferentes não decifram uma a outra
- [x] **expressões** (28 testes, `packages/nodes`): jest+ts-jest próprio
      (ESM/CJS — tsconfig.jest.json dedicado). Cobre `$input`/`$vars`/`$node`,
      `getPath`, `preserveRoots`, `extraRoots`, `knownNodeIds`,
      `hasUnresolvedExpression`
- [x] **engine** (9 testes): sem NestJS TestingModule (mocks direto no
      construtor); `@workflow/nodes`/`@workflow/ai` mockados por completo.
      Cobre ondas concorrentes (Promise.all provado por contador), branch
      não tomada, join/merge com ordem determinística, retry com backoff,
      onError:'branch' com/sem edge de erro (C3), replay parcial
      reconstituindo `$vars` via varsPatch (C4), alerta disparado só em falha
- [x] **sandbox** (9 testes): mocka `node:worker_threads` inteiro — testa a
      orquestração real (timeout, terminate, roteamento de RPC), não o
      worker de fato
- [x] **rate-limiter de IA** (4 testes, `packages/ai`): `ioredis-mock` real
      (não fake manual). Bug de flakiness pego e corrigido: teste de estouro
      precisava fixar o relógio (`setSystemTime`) pra não cruzar a borda da
      janela de 60s dependendo do horário real de execução
- [x] **Achado real de build**: `tsconfig.build.json` de `packages/nodes` e
      `packages/ai` não excluíam `*.spec.ts` do build de produção — corrigido
      com `exclude`, no padrão que `apps/api` já usava

## Fase H1.3 — E2E smoke no CI ✅ concluída (2026-07-30)

- [x] Job `e2e-smoke` em `.github/workflows/ci.yml`, independente/paralelo
      ao job `build` — services Postgres (pgvector) + Redis reais
- [x] `prisma generate` + build completo + `migrate deploy` + seed
- [x] Sobe `api`/`worker`/`web` a partir do `dist/` de produção, espera
      health/login responderem antes de rodar os testes
- [x] Subconjunto smoke por tag `@smoke` no título (5 testes): registro (UI),
      login (UI), `POST /workflows` (API), usar template (UI, fluxo completo
      até o editor), execução manual com sucesso (prova worker+fila+engine
      ponta-a-ponta)
- [x] `playwright install chromium --with-deps` + upload de report e de logs
      dos servidores como artifact em falha
- [x] **Validado de verdade**: Postgres+Redis temporários em portas
      alternativas, sequência exata do job rodada manualmente (migrate
      deploy num banco vazio, seed, boot dos 3 processos) — 5/5 smoke
      passaram contra esse ambiente simulado do zero
- [ ] **Não incluído**: teste automatizado de 429 (H1.1) — precisaria de
      `THROTTLE_AUTH_LIMIT` baixo, incompatível com os outros ~260 testes

## Fase H1.4 — Sentry (api + worker + web) ✅ concluída (2026-07-30)

- [x] `@sentry/nestjs` na api/worker: `instrument.ts` novo (carrega
      `load-env` primeiro, depois `Sentry.init`), importado como primeiro
      import em `main.ts`/`worker.main.ts`; `SentryModule.forRoot()` nos
      dois module roots
- [x] `captureException` manual no `AllExceptionsFilter` (5xx e erros
      não-HTTP — **não** usei o decorator oficial `@SentryExceptionCaptured`
      porque ele trata todo HttpException como "esperado" independente do
      status, divergindo do critério que o filtro já usa) e no ponto único
      de falha do engine (erro cruza o worker_thread como string — wrap em
      `new Error()` antes de capturar)
- [x] Tags de correlação: `requestId`, `workspaceId`, `userId`, `executionId`
      (api); `executionId`, `workflowId`, `workspaceId`, `triggerType` (worker)
- [x] `@sentry/nextjs` no web via convenção moderna do Next 16
      (`instrumentation.ts` + `instrumentation-client.ts`, não os antigos
      `sentry.*.config.ts`) + `global-error.tsx` como canal complementar ao
      `/telemetry/client-errors` já existente
- [x] `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` via env; sem DSN = SDK desabilitado
- [x] `environment`/`release` nas duas pontas
- [x] Env documentadas em `railway.md`/`vercel.md` (ainda não setadas em
      produção — ação do usuário)
- [x] Validado: boot limpo sem DSN e com DSN fake (nenhum crash);
      `pnpm test`/`build` seguem verdes
- [ ] **Não verificado** (sem conta Sentry real): que um evento chega de
      fato no dashboard — só o comportamento local (no-op sem DSN, não
      derruba o boot) foi confirmado

## Fase H1.5 — Email de sistema + reset de senha ✅ concluída (2026-07-30)

- [x] **MailerModule**: nodemailer via `SMTP_HOST/PORT/USER/PASS/EMAIL_FROM`;
      no-op com warning se `SMTP_HOST` ausente
- [x] **Mailpit** no `docker-compose.dev.yml` (porta 1025 SMTP, 8025 UI/API)
- [x] `model PasswordResetToken` (hash sha256, TTL 30min, single-use) +
      migration
- [x] `POST /auth/forgot-password` sempre 200/201 (nunca vaza); envia link
      `{WEB_URL}/reset-password?token=...`
- [x] `POST /auth/reset-password`: hash+TTL+single-use, invalida os demais
      tokens do usuário ao usar um
- [x] Limitação documentada (código + `railway.md`): reset não revoga
      refresh tokens (JWT stateless) — fica pro RBAC/H3
- [x] Telas `(auth)/forgot-password` e `(auth)/reset-password` (gate de
      "link inválido" sem `?token=`), i18n pt/en, link no login
- [x] E2E lendo o email de verdade via API HTTP do Mailpit (4 testes:
      fluxo completo, reuso de token, token inválido, não-vazamento)
- [x] Env `SMTP_*`/`EMAIL_FROM`/`WEB_URL` documentadas em `railway.md`
      e `.env.example`
- [x] **BUG REAL pego e corrigido**: a migration gerada incluiu, por
      engano, `DROP INDEX "chunks_embedding_hnsw_idx"` — índice HNSW crítico
      pra performance do RAG, dropado por um drift espúrio do Prisma
      documentado em `schema.prisma` (já tinha acontecido uma vez, Fase 11).
      Corrigido seguindo o procedimento documentado: recriar o índice a
      mão + remover a linha do migration.sql
- [x] **BUG REAL pego e corrigido**: as duas páginas novas voltavam 307
      (redirect pro login) — `apps/web/src/proxy.ts` tinha uma allowlist
      fixa de rotas públicas que não incluía as duas rotas novas
- [x] **Validado com fluxo real completo**: registro → forgot-password →
      email confirmado no Mailpit → reset → login com senha nova → reuso
      do token rejeitado (400) → token bogus rejeitado (400) → i18n do
      erro confirmado com `x-lang: en`

## Fase H1.6 — Alerting de falhas de execução ✅ concluída (2026-07-30)

- [x] `model WorkspaceAlertSetting` (workspaceId único, `emailEnabled`
      default true, `webhookUrl?`) + migration
- [x] `AlertsService` no worker: hook no ponto único de finalização com
      falha do engine — fire-and-forget, nunca derruba a execução
- [x] Conteúdo: workflow, executionId, erro, link direto pra execução no web
- [x] Canais: email pra todos os membros do workspace + `POST webhookUrl`
      (payload JSON com `event`/`workflowId`/`executionId`/`error`/`url`)
- [x] Anti-spam: máx. 1 alerta por workflow a cada N minutos
      (`ALERT_THROTTLE_MINUTES`, default 10) via `CacheService` (Redis já
      existente, sem client novo)
- [x] API: `GET`/`PUT /workspaces/alert-settings` + `POST .../test`
      (WorkspaceGuard)
- [x] Web: seção "Alertas" em Settings (toggle email, campo webhook URL,
      botões Salvar/Enviar teste)
- [x] 11 testes unitários (throttle, disparo por canal, resiliência a
      falha de mailer/Prisma, `sendTest` ignora throttle)
- [x] **BUG REAL pego de novo (3ª vez)**: mesmo `DROP INDEX` espúrio do
      HNSW na migration desta tabela. Desta vez usei `--create-only` pra
      revisar antes de aplicar — o que expôs um problema novo: como eu
      tinha editado a migration do H1.5 DEPOIS de aplicada, o checksum
      divergente fez o `prisma migrate dev` **pedir reset completo do
      banco de dev**. Não fiz — corrigi calculando o SHA-256 do arquivo já
      corrigido e fazendo `UPDATE _prisma_migrations SET checksum = ...`
      direto via psql. Lição gravada: sempre `--create-only` e corrigir
      ANTES de aplicar, nunca depois
- [x] **Validado com cenário real completo, não só mock**: fluxo real que
      falha de propósito (porta discard `127.0.0.1:9`), rodado 2x seguidas
      — 1ª falha disparou email E webhook com payload correto; 2ª falha
      (mesma janela de 10min) **não gerou um segundo alerta em nenhum
      canal** — anti-spam provado contra falha real, não simulada

---

## Verificação de saída do H1

- [x] `pnpm test` com testes reais de engine/expressões/crypto verdes
      (59 testes em 3 packages)
- [x] CI local: lint + typecheck + build + unit verdes em todo o monorepo;
      job `e2e-smoke` validado manualmente contra ambiente simulado do zero
      (não verificado num run real do GitHub Actions — ver nota abaixo)
- [x] Brute force em `/auth/login` leva 429; headers de segurança presentes
- [ ] **Não verificado**: erro forçado em produção aparecendo no Sentry
      (sem conta/DSN real disponível nesta sessão — comportamento local
      confirmado: no-op sem DSN, não derruba boot com DSN fake)
- [x] Fluxo completo de reset de senha funciona (validado em dev local
      completo, com Mailpit; não em produção real)
- [x] Execução falhada gera email/webhook em até poucos segundos, com
      anti-spam confirmado contra uma falha real repetida
- [x] `base-evolucao.md` §5 atualizado marcando o H1 como concluído

### Pendências que ficam para o usuário (fora do alcance desta sessão)

- Configurar `SENTRY_DSN` real (conta Sentry) em produção e confirmar
  visualmente um evento no dashboard
- Setar as novas env vars no Railway/Vercel (`CORS_ORIGINS`, `THROTTLE_*`,
  `SENTRY_*`, `SMTP_*`, `WEB_URL`, `ALERT_THROTTLE_MINUTES`) — nenhuma foi
  aplicada em produção, só documentada
- Acompanhar a primeira execução real do job `e2e-smoke` no GitHub Actions
  (validado localmente contra ambiente simulado, não contra um runner real)
- Testar a UI de reset de senha e de Alertas num navegador de verdade
  (Chrome MCP não estava disponível nesta sessão — validado via SSR,
  typecheck/build e paridade de padrão com código já comprovado)

### Notas de execução (ambiente local)

- Nunca rodar `build` de app com `pnpm dev` ativo (corrompe dist/.next).
- Playwright local: exportar `E2E_API_URL=http://192.168.1.100:3333` e
  `E2E_BASE_URL=http://192.168.1.100:3000` (o fixture `request` trava em
  `localhost` nesta máquina; web acessado por IP de LAN).
