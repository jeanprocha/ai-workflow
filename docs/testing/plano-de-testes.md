# Plano de testes — Workflow AI Platform

## Por que este documento existe

Corrigir um bug, dar deploy pra ver se resolveu, achar outro bug, dar deploy
de novo — isso gera dezenas de deploys por sessão e cada ciclo custa minutos
de build + o risco de testar em cima de dados reais de produção. A partir de
agora, **tudo é validado localmente primeiro**, seção por seção da
plataforma, antes de qualquer deploy. Duas frentes por seção:

1. **Automatizado (Playwright)** — cobre o que dá pra afirmar com certeza:
   fluxos, validações, mensagens de erro, estados de sessão, redirects.
2. **Manual (você)** — cobre o que exige julgamento humano: visual, "parece
   rápido o suficiente?", comportamento entre abas, password manager do
   browser, smoke test pontual em produção.

## Como rodar

Pré-requisitos (você mantém rodando no seu próprio terminal):

```bash
docker compose -f docker-compose.dev.yml up -d
pnpm --filter @workflow/api dev
pnpm --filter @workflow/web dev
```

Primeira vez só (baixa o binário do Chromium):

```bash
pnpm --filter @workflow/e2e exec playwright install chromium
```

Rodar a suíte:

```bash
pnpm test:e2e                              # tudo
pnpm --filter @workflow/e2e exec playwright test tests/auth   # só uma fase
pnpm --filter @workflow/e2e e2e:ui         # modo interativo (debug visual)
pnpm --filter @workflow/e2e report         # abre o ultimo relatorio HTML
```

`pnpm test:e2e` **não** entra no `pnpm test` (Turborepo) nem no CI — precisa
de Postgres/Redis/API/Web reais rodando, então é sempre um comando explícito.

## Convenções da suíte

- **Sem seed de usuário/dados** — cada teste que precisa de conta cria a sua
  via `helpers/auth.ts` (`buildTestUser()` gera email único
  `e2e+<timestamp>-<random>@teste.local`). Isso evita testes dependerem de
  ordem de execução ou pisarem uns nos outros.
- **Locators por label/role em português**, não `data-testid` — o app não tem
  nenhum hoje e a UI inteira é em pt-BR. Se algum locator se mostrar frágil na
  prática, adicionamos `data-testid` pontualmente (o `Input` de
  `apps/web/src/components/ui/input.tsx` já aceita a prop).
- **Testes de UI vs testes de API**: quando o teste é sobre a UI em si
  (validação de formulário, mensagem de erro visível, redirect), passa pela
  página de verdade. Quando é só setup pra chegar num estado (ex.: "preciso
  de um usuário logado pra testar outra coisa"), usa os helpers de API
  (`registerViaApi`, `loginViaApi`, `buildStorageState`) — mais rápido, sem
  pagar o custo de preencher formulário toda vez.
- **Custo de IA real**: specs que chamam Anthropic/OpenAI/Gemini de verdade
  (Fase 11: Autocomplete, Copilot, Debugger, Cost Optimizer) usam a tag
  `@ai` no título do teste e **não** rodam por padrão — só sob demanda
  (`playwright test --grep @ai`), porque cada rodada gasta tokens reais.

## Diagnóstico de falhas

Todo teste passa pela fixture de `helpers/fixtures.ts` (reexporta `test`/
`expect` — specs importam dali, não de `@playwright/test` direto). Ela faz
duas coisas automaticamente, só quando um teste **falha**:

1. **Anexa ao report** o console do browser (`browser-console.json`), erros
   de página não capturados (`browser-page-errors.json`) e requests que
   falharam (`browser-requests-failed.json`).
2. **Busca os logs do servidor** daquele teste especifico via
   `GET /debug/logs?testRun=...` — na API (`:3333`) e no worker (`:3334`) — e
   anexa como `server-logs-api.json` / `server-logs-worker.json`. A
   correlação usa o mesmo `x-test-run` (header enviado pelo
   `apps/web/src/lib/api-client.ts` quando `window.__E2E_TEST_RUN__` está
   setado, injetado pela fixture via `addInitScript` antes de qualquer JS da
   página) que alimenta o campo `testRun` em todo log estruturado da API/
   worker (Fase 2 da observabilidade).

Pré-requisito: `OBS_DEBUG_ENDPOINT=1` no `.env` da API (já é o padrão em
dev — nunca setar em produção) — **precisa reiniciar** `pnpm --filter
@workflow/api dev`/`dev:worker` depois de mudar o `.env`, variáveis de
ambiente não recarregam sozinhas. Sem isso, `/debug/logs` responde 404 e a
fixture simplesmente não anexa os logs do servidor (não quebra o teste por
causa disso).

`trace: 'retain-on-failure'` no `playwright.config.ts` garante que rodando
local (sem retry) o trace completo (DOM snapshots, network, console passo a
passo) fica disponível pra quem falhou:

```bash
pnpm --filter @workflow/e2e exec playwright show-trace test-results/<pasta-do-teste>/trace.zip
```

Ou simplesmente `pnpm --filter @workflow/e2e report` pra ver tudo (trace +
anexos) no report HTML.

## Roadmap das fases

| # | Fase | Escopo | Status |
|---|------|--------|--------|
| 01 | Auth | Registro, login, sessão, proteção de rotas, refresh de token | ✅ suíte pronta (`tests/auth/`) |
| 02 | Settings | CRUD de credenciais e variáveis — pré-requisito das features de IA | ✅ suíte pronta (`tests/settings/`) |
| 03 | Flows (lista) | CRUD de fluxo, criar do zero / por template / por IA, arquivar, renomear, excluir | ✅ suíte pronta (`tests/flows/`) |
| 04 | Editor | Canvas (React Flow), paleta de nodes, config panel, salvar grafo, executar, versões/rollback | ✅ suíte pronta (`tests/editor/`) |
| 05 | Executions | Lista com filtros, detalhe/timeline, replay total e parcial, stream SSE ao vivo | ✅ suíte pronta (`tests/executions/`) |
| 06 | Agents | CRUD de agentes, ferramentas, memória, chat de teste | ✅ suíte pronta (`tests/agents/`) |
| 07 | Knowledge | Upload de documento, ingestão (precisa do worker rodando), busca semântica | ✅ suíte pronta (`tests/knowledge/`) |
| 08 | MCP | Conectar servidor, listar tools, chamar tool, desconectar | ✅ suíte pronta (`tests/mcp/`) |
| 09 | Dashboard/Analytics | Métricas agregadas, gráficos, timeseries | ✅ suíte pronta (`tests/analytics/`) |
| 10 | Fase 11 (IA de plataforma) | Autocomplete, Copilot, AI Debugger, Cost Optimizer — marcados `@ai` | ✅ suíte pronta (`tests/platform-ai/`) |
| 11 | Busca global / Scheduler | Ctrl+K, agendamento cron de fluxo | ✅ suíte pronta (`tests/search-scheduler/`) |
| 12 | Chat | Trigger `trigger.chat`/node `chat.reply`, páginas públicas `/chat` e `/inbox`, estado por conversa, atendimento manual | ✅ suíte pronta (`tests/chat/`) |

Cada fase futura ganha seu próprio `tests/<fase>/*.spec.ts` seguindo o mesmo
padrão desta (helpers dedicados se precisar, doc manual companheiro em
`docs/testing/manual/<NN>-<fase>.md`).

## Antes de dar deploy

1. `pnpm test:e2e` verde (fases já cobertas).
2. Roteiro manual da(s) fase(s) tocada(s) em `docs/testing/manual/` — sem
   pendência crítica.
3. `pnpm turbo run typecheck lint test` verde (checagem estática + jest).
4. Só então `railway up` / `vercel --prod`.
