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

## Roadmap das fases

| # | Fase | Escopo | Status |
|---|------|--------|--------|
| 01 | Auth | Registro, login, sessão, proteção de rotas, refresh de token | ✅ suíte pronta (`tests/auth/`) |
| 02 | Settings | CRUD de credenciais e variáveis — pré-requisito das features de IA | pendente |
| 03 | Flows (lista) | CRUD de fluxo, criar do zero / por template / por IA, arquivar, renomear, excluir | pendente |
| 04 | Editor | Canvas (React Flow), paleta de nodes, config panel, salvar grafo, executar, versões/rollback | pendente |
| 05 | Executions | Lista com filtros, detalhe/timeline, replay total e parcial, stream SSE ao vivo | pendente |
| 06 | Agents | CRUD de agentes, ferramentas, memória, chat de teste | pendente |
| 07 | Knowledge | Upload de documento, ingestão (precisa do worker rodando), busca semântica | pendente |
| 08 | MCP | Conectar servidor, listar tools, chamar tool, desconectar | pendente |
| 09 | Dashboard/Analytics | Métricas agregadas, gráficos, timeseries | pendente |
| 10 | Fase 11 (IA de plataforma) | Autocomplete, Copilot, AI Debugger, Cost Optimizer — marcados `@ai` | pendente |
| 11 | Busca global / Scheduler | Ctrl+K, agendamento cron de fluxo | pendente |

Cada fase futura ganha seu próprio `tests/<fase>/*.spec.ts` seguindo o mesmo
padrão desta (helpers dedicados se precisar, doc manual companheiro em
`docs/testing/manual/<NN>-<fase>.md`).

## Antes de dar deploy

1. `pnpm test:e2e` verde (fases já cobertas).
2. Roteiro manual da(s) fase(s) tocada(s) em `docs/testing/manual/` — sem
   pendência crítica.
3. `pnpm turbo run typecheck lint test` verde (checagem estática + jest).
4. Só então `railway up` / `vercel --prod`.
