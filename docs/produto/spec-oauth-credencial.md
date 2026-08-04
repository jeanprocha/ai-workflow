# SPEC — OAuth como método de credencial (v1: Google)

Data: 2026-08-03. Origem: item 1 da ordem sugerida em
[`discovery-lacunas-mercado.md`](discovery-lacunas-mercado.md) §1. Objetivo:
hoje toda credencial é chave/senha colada num formulário — inviável para a
maioria dos SaaS de mercado (Google, Microsoft, Slack app, Notion...), que só
autenticam por OAuth. Esta spec entrega o método de credencial `oauth`, com
Google como único provedor da v1 (decisão do usuário: criar apps para outros
provedores é trabalho manual dele, feito sob demanda).

O fio condutor de todo o desenho: o contrato `ctx.getCredential(name):
Promise<string>` (`packages/nodes/src/types.ts:16`) já é deliberadamente
opaco — nenhum node sabe se a string que recebe veio de uma senha colada ou
de um access_token OAuth renovado há 2 minutos. Isso significa que os ~15
nodes de integração existentes (Slack, Notion, GitHub, Stripe, HTTP
genérico...) passam a aceitar credencial OAuth **sem nenhuma mudança**.

---

## O que o discovery encontrou

1. **O decrypt de credencial está copiado em 7 lugares**, não 5 como o
   discovery inicial estimou: `engine.service.ts:1168`,
   `agents/tools.ts:17`, `agents.service.ts:268`,
   `autocomplete.service.ts:212`, `debugger.service.ts:271`,
   `copilot.service.ts:179`, `knowledge.service.ts:283`. Todos fazem
   `findFirst({workspaceId, name})` + `crypto.decrypt`, sem parse — divergem
   só no tipo de exceção lançada. Renovar token só no caminho da engine
   deixaria os outros seis devolvendo token expirado.
2. **`Credential.kind` já é string livre** (`schema.prisma:198`,
   `@default("secret")`) — um `kind: "oauth"` entra sem migration de enum,
   seguindo o mesmo padrão que `kind: "fields"` já usa.
3. **Não existe redirect HTTP em lugar nenhum do backend.** Todas as rotas
   hoje devolvem JSON ou SSE. O callback OAuth será o primeiro `res.redirect()`
   do projeto.
4. **O frontend nunca navega para a API fora de `apiFetch`** — todo
   `Authorization: Bearer` sai só dali (`apps/web/src/lib/api-client.ts`).
   Um `GET /oauth/:provider/start` navegado pelo browser não carregaria o
   JWT. O start precisa ser chamado via `apiFetch` (autenticado) e devolver
   a URL de autorização em JSON; quem navega para o provedor é o browser via
   `window.open`, não um redirect do backend.
5. **`ValidationPipe` global tem `forbidNonWhitelisted`** (`main.ts`) — o
   Google injeta parâmetros extras no callback (`scope`, `authuser`,
   `prompt`, às vezes `hd`) que uma classe DTO tradicional rejeitaria. O
   callback não pode usar um DTO de classe para a query inteira.
6. **Não existe primitiva de lock no repo.** `CacheService`
   (`apps/api/src/cache/cache.service.ts`) só tem `get`/`set`/`getOrSet`; o
   client ioredis é privado. Toda concorrência hoje é resolvida por
   `updateMany` condicional no Postgres (molde: `ApprovalsService`). Refresh
   de token com rotation (Google reusa e invalida) precisa de exclusão
   mútua de verdade — Postgres sozinho não dá isso sem outra tabela.
7. **Já existe uma troca OAuth no repo, e não deve ser copiada**: o node
   `google-drive-list-files.ts` assina um JWT-bearer de Service Account
   **dentro do sandbox** do node. Funciona porque Service Account não tem
   `client_secret` de plataforma — copiar esse desenho para OAuth de usuário
   vazaria o `client_secret` da aplicação para o worker_thread.

## Decisões (e alternativas rejeitadas)

1. **`kind: "oauth"` no model `Credential` existente, não um model
   separado.** O blob `{access_token, refresh_token, token_type}` cifrado
   cabe em `encryptedData` como o `kind: "fields"` já demonstra. Colunas
   novas em claro — `oauthProvider`, `oauthExpiresAt`, `oauthScopes`,
   `oauthStatus`, `oauthLastError` — seguem o mesmo racional do
   `fieldsMeta`: a UI precisa saber "expirado?" sem nunca descriptografar
   (ADR-007). _Rejeitado_: model `OAuthCredential` à parte — duplicaria
   `getCredential`, a listagem e o `CredentialSelect` do editor por nada.

2. **Start autenticado devolve JSON, não redireciona.**
   `POST /oauth/:provider/start` (JWT + `WorkspaceGuard`), corpo opcional
   `{ name? }` (default = nome do provedor), 409 se o nome já existir —
   falha _antes_ de sair do app, evitando um usuário voltar do Google só
   para descobrir um conflito de nome. Devolve `{ authorizeUrl }`; o
   frontend abre em `window.open`. _Rejeitado_: `GET` com redirect direto —
   não carrega Bearer (achado 4).

3. **State com o molde exato do `PasswordResetToken`.** Model `OAuthState`:
   `stateHash` (sha256, `@unique`), `workspaceId`, `userId`, `provider`,
   `credentialName`, `expiresAt` (TTL 10 min), `usedAt`. Uso único,
   mensagem de recusa única (não distinguir "expirado" de "inválido" —
   mesmo padrão do reset de senha). O `state` é o único jeito de amarrar um
   callback público ao workspace certo, porque o callback chega sem JWT.

4. **Callback público, sem DTO de classe para a query.**
   `GET /oauth/callback` (`@Public()`), lê `@Query() query: Record<string,
string>` cru (achado 5), valida manualmente `code`/`state`/`error`.
   Rate limit por IP, molde `approval-rate-limit.ts`. Resposta:
   `res.redirect(...)` para `${WEB_URL}/settings?oauth=ok|erro&provider=...`
   — primeiro uso de redirect HTTP no backend (achado 3).

5. **Troca code→token e refresh vivem só no service, nunca no sandbox.**
   Contradiz o padrão do node Google Drive de propósito (achado 7):
   `client_secret` não pode alcançar o worker_thread. O `fetch` de troca
   roda no processo principal da API, com timeout curto (8s) dedicado —
   sem isso, uma troca lenta consumiria o orçamento do timeout do sandbox
   (30s) durante a _primeira_ chamada de um node que dependa do token,
   e o erro apareceria como "timeout do node" em vez de "OAuth falhou".

6. **`CredentialsService.resolve()` único substitui as 7 cópias.** Para
   `kind !== "oauth"`: comportamento idêntico ao decrypt cru atual — nenhuma
   mudança observável. Para `kind === "oauth"`: se `oauthExpiresAt` está a
   menos de 120s de expirar, renova antes de devolver; sempre devolve só o
   `access_token` (o contrato opaco é preservado — zero mudança nos ~15
   nodes). _Rejeitado_: manter o refresh só no caminho da engine — os outros
   seis consumidores (achado 1) continuariam servindo token expirado.

7. **Lock via `CacheService.acquireLock`/`releaseLock` (SET NX PX), não uma
   biblioteca de lock distribuído.** TTL de 15s (folga sobre os 8s do
   timeout de troca); quem não adquire espera em loop curto (250ms, até 5s)
   e relê o token já renovado por quem tem o lock. Suficiente para o volume
   esperado (renovação é rara — só perto da expiração); redlock de verdade
   fica para se a contenção se provar um problema. `invalid_grant` do
   provedor marca `oauthStatus: "error"` + `oauthLastError` e lança
   `BadRequestException` com mensagem acionável — não tenta de novo
   silenciosamente.

8. **Registry de provedores em código, não em banco.**
   `apps/api/src/oauth/providers.ts`: mapa `authorizeUrl`, `tokenUrl`,
   `defaultScopes`, `clientId`/`clientSecret` lidos de env por provedor
   (`GOOGLE_OAUTH_CLIENT_ID`/`_SECRET`). Google v1: scopes
   `openid email https://www.googleapis.com/auth/drive.readonly`, com
   `access_type=offline&prompt=consent` — sem isso o Google só devolve
   `refresh_token` na primeira autorização, nunca nas seguintes. Um
   provedor `_test` é registrado só quando `OAUTH_TEST_AUTHORIZE_URL` e
   `OAUTH_TEST_TOKEN_URL` estão setadas e `NODE_ENV !== "production"` —
   molde do `OBS_DEBUG_ENDPOINT` condicional
   (`observability.module.ts`) — para o e2e ter um provedor fake sem
   depender do Google real. _Rejeitado no v1_: "traga seu próprio app" por
   workspace (client_id/secret de terceiros) — os da plataforma bastam
   enquanto for um provedor só.

9. **Sem job de renovação antecipada.** A decisão 6 já cobre o caso comum
   (renovação sob demanda, com skew de 120s). Um job periódico
   (molde: `mcp-health`) fica para quando o volume de nodes dependentes de
   OAuth justificar evitar a latência do primeiro fetch pós-expiração.

## Contrato

```
POST /oauth/:provider/start          (autenticado, WorkspaceGuard)
  Body: { name?: string }
  201 { authorizeUrl: string }
  409 nome de credencial ja existe

GET /oauth/callback                  (@Public())
  Query: code, state, error?
  302 -> {WEB_URL}/settings?oauth=ok&provider=...
  302 -> {WEB_URL}/settings?oauth=erro&provider=...   (state invalido/expirado/usado, troca falhou)

GET /oauth/providers                 (autenticado)
  200 [{ provider: "google", label: "Google" }, ...]   (só os habilitados por env)
```

`CredentialsService.resolve(workspaceId, name): Promise<string>` — nova API
interna, substitui as 7 cópias do decrypt. Mesma assinatura efetiva do
`getCredential` de hoje; mensagens de erro preservadas byte a byte (specs e
e2e existentes as comparam por texto).

## Fases de implementação (commits)

**C1 — consolidação do resolve (pré-requisito, sem OAuth ainda).**
`CredentialsService.resolve()`; `CredentialsModule` passa a exportar o
service (hoje não exporta — único importador é `app.module.ts`); os 7
call-sites substituídos por injeção do service. Nenhuma mudança de
comportamento observável — a suíte de testes existente (engine, agents,
autocomplete, debugger, copilot, knowledge) é a prova.

**C2 — schema + módulo `oauth/`.** Migration (`--create-only`, inspecionar o
`DROP INDEX` espúrio do HNSW que aparece em toda migration nova — ver
CLAUDE.md): model `OAuthState` + colunas `oauth*` em `Credential`. Módulo
`oauth/` (controller, service, `providers.ts`, rate limit próprio). Start,
callback, listagem de providers.

**C3 — refresh on-demand.** `CacheService.acquireLock`/`releaseLock`; ramo
`oauth` dentro de `resolve()`; tratamento de `invalid_grant`.

**C4 — frontend + e2e.** `ConnectionsSection` ganha botão "Conectar" por
provedor habilitado, popup, leitura do `?oauth=` no retorno (toast +
invalidação de `["credentials"]`), badge de estado. Fixture
`apps/e2e/fixtures/oauth-fake-provider.mjs` (http server local com
`/authorize` e `/token`) — primeiro fake HTTP do e2e (o precedente,
`mcp-echo-server.mjs`, é stdio). Spec cobrindo conectar → credencial
`kind: oauth` listada com badge ativo.

**C5 — envs e docs de operação.** `apps/api/.env.example` (bloco OAuth);
`docs/deploy/railway.md` (nova seção no catálogo); `docs/sistema/12-auth-
workspaces.md` e `docs/sistema/13-web-editor.md` atualizados com carimbo
novo; `/doc-sync`.

## Critérios de aceite

- `kind !== "oauth"` continua funcionando idêntico ao decrypt atual, com as
  mesmas mensagens de erro — provado pela suíte existente sem alteração.
- Conectar Google (via provedor `_test` no e2e) cria uma `Credential` com
  `kind: "oauth"`, `oauthStatus: "active"`, sem o valor decifrado em
  nenhuma resposta HTTP.
- Um `state` usado duas vezes, expirado, ou de outro workspace é recusado
  com a mesma mensagem (sem distinguir o motivo).
- `resolve()` renova o token quando `oauthExpiresAt` está a menos de 120s,
  e não renova quando está longe — verificável por mock de tempo em teste
  unitário.
- Duas chamadas concorrentes a `resolve()` da mesma credencial expirada
  resultam numa única troca de token (lock), não duas.
- `client_secret` do Google nunca aparece em nenhum log nem alcança o
  worker_thread do sandbox.
- O callback aceita os parâmetros extras que o Google envia (`authuser`,
  `prompt`, `scope`) sem 400.

## Fora de escopo (deliberado)

- Outros provedores (GitHub, Notion, Microsoft...) — o registry está pronto
  para receber cada um como uma entrada nova + par de envs; nenhum entra
  nesta spec.
- "Traga seu próprio app" por workspace — client_id/secret são da
  plataforma via env enquanto houver um provedor só.
- Job de renovação antecipada — decisão 9.
- Nodes novos que consomem Google (Sheets, Gmail, Calendar...) — esta spec
  entrega a credencial utilizável pelo contrato opaco existente; nodes são
  entregas próprias, depois desta.
- Revogar o token no provedor ao deletar a credencial (best-effort) — melhoria
  futura, não bloqueia a v1.
- Migrar o node `google-drive-list-files` (Service Account) para o novo
  caminho OAuth de usuário — são mecanismos de autenticação diferentes por
  natureza (app-to-app vs. usuário-delegado); não misturar nesta entrega.
