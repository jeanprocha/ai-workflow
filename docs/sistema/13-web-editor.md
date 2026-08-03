# Web e editor

> Última revisão: 2026-08-03 · commit `93468bf`

## O que faz

`apps/web` é o único cliente da plataforma: um Next.js 16 com App Router e React 19 que consome a API REST/SSE e nada mais. Não há Server Actions nem acesso a banco a partir do frontend — a fronteira é sempre HTTP, e isso é o que permite que a mesma API sirva o editor visual, a página pública de aprovação e um consumidor externo sem tratamento especial.

O aplicativo se divide em três territórios, e a divisão é estrutural, não estética. O grupo `(app)` é a aplicação autenticada: sidebar, topbar, command palette, transição de página — tudo dentro de um `AppShell`. O grupo `(auth)` é o funil de entrada: login, registro e o par forgot/reset de senha, com layout próprio e sem chrome de aplicação. E fora de qualquer grupo ficam as **rotas públicas por token** — `/approve/[token]`, `/chat/[token]` e `/inbox/[token]` — endereços que um destinatário externo abre sem ter conta, e que por isso não podem herdar nem o shell nem o gate de sessão.

O editor de fluxo (`/flows/[id]`) também mora **fora** do grupo `(app)`, e por um motivo concreto: ele é full-bleed. O canvas ocupa a viewport inteira, com a paleta de nodes de um lado e o painel de configuração do outro; enfiá-lo dentro do `AppShell` significaria disputar espaço com uma sidebar que não serve para nada enquanto se edita um grafo. O canvas em si é `@xyflow/react`, e em volta dele orbita um conjunto pequeno de peças: a paleta que arrasta nodes para dentro, o painel de config que edita o node selecionado, o copiloto que gera ou altera o grafo por prompt, o histórico de versões, as configurações do fluxo, e a _pulse edge_ — a aresta que anima um ponto percorrendo a linha quando a execução passa por ali.

O gate de autenticação vive em `apps/web/src/proxy.ts` — o middleware do Next, com este nome nesta versão. Ele opera sobre **duas** listas, e a distinção entre elas é sutil o bastante para já ter causado bug. `AUTH_ROUTES` são as páginas do funil de entrada: quem **não** tem sessão pode entrar, e quem **tem** sessão é redirecionado para o `/dashboard` (não faz sentido um usuário logado ver a tela de login). `PUBLIC_ROUTES` é o superconjunto — `AUTH_ROUTES` mais `/chat`, `/inbox` e `/approve` — e significa apenas "não exige sessão". A regra de redirecionar quem está logado se aplica **só** à primeira lista. Colocar `/approve` em `AUTH_ROUTES` foi exatamente o bug corrigido no commit `80da213`: um aprovador que por acaso estivesse logado na plataforma clicava no link de aprovação recebido por email e era chutado para o dashboard, sem nunca ver a decisão que precisava tomar. A regra prática: **rota pública que também faz sentido para quem já está logado entra só em `PUBLIC_ROUTES`.**

O acesso a dados segue um padrão único e sem exceções relevantes: **um arquivo de hooks por recurso da API**, em `apps/web/src/hooks/`, espelhando 1:1 os controllers do backend. Cada arquivo exporta as interfaces TypeScript do recurso, uma constante de query key, um `useQuery` de listagem/detalhe e um `useMutation` por operação de escrita — cada mutação invalidando a query key correspondente no `onSuccess`. São 27 arquivos hoje; conhecer um é conhecer todos, e achar o hook de um recurso é adivinhar o nome do arquivo. Três deles fogem do molde por não falarem com a API (`use-theme`, `use-reduced-motion`) ou por consumirem SSE em vez de REST (`use-execution-stream`, `use-execution-live`).

Tudo passa por `lib/api-client.ts`, que injeta `Authorization`, `x-workspace-id`, o locale e um `x-request-id` de correlação, aplica timeout e faz o refresh de token de forma deduplicada — com o cuidado de distinguir "refresh recusado pelo servidor" de "a rede caiu no meio", porque tratar o segundo como o primeiro derrubava a sessão do usuário por uma oscilação de conexão. A configuração do React Query fica em `components/providers.tsx`: toast global só para erros de _query_ (mutações tratam erro no call site, e um handler global duplicava toast), e retry desligado para 400/404, onde insistir só atrasa o feedback.

A interface é bilíngue (pt-BR default, en-US disponível), com dicionários em `lib/i18n/dictionaries/` fatiados por área da aplicação. Tema é dark por padrão, com um script inline no root layout que aplica tema e `lang` antes da hidratação para evitar flash.

## Onde vive

| Arquivo                                                                        | Papel                                                                                                  |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `apps/web/src/proxy.ts`                                                        | Middleware do Next: gate de sessão, `AUTH_ROUTES` vs `PUBLIC_ROUTES`.                                  |
| `apps/web/src/app/layout.tsx`                                                  | Root layout: fontes Geist (sans + mono), script de tema/locale pré-hidratação, `Providers`, `Toaster`. |
| `apps/web/src/app/(app)/layout.tsx`                                            | Envolve tudo que é autenticado no `AppShell`.                                                          |
| `apps/web/src/components/providers.tsx`                                        | `QueryClient` com retry condicional e toast global só de query.                                        |
| `apps/web/src/lib/api-client.ts`                                               | Cliente HTTP: auth headers, workspace, request-id, timeout, refresh deduplicado.                       |
| `apps/web/src/lib/auth-storage.ts`                                             | Persistência de tokens e do workspace ativo.                                                           |
| `apps/web/src/lib/sse-client.ts`                                               | Stream de execução com reconexão, backoff e watchdog.                                                  |
| `apps/web/src/lib/errors.ts`                                                   | `ApiError`/`NetworkError`/`TimeoutError` e `errorMessage()`.                                           |
| `apps/web/src/lib/telemetry.ts`                                                | `window.onerror`/`unhandledrejection` → `POST /telemetry/client-errors`.                               |
| `apps/web/src/lib/i18n/`                                                       | Dicionários por área + store de locale.                                                                |
| `apps/web/src/lib/nav.ts`                                                      | Estrutura da sidebar em grupos (build / operate / recursos).                                           |
| `apps/web/src/lib/node-catalog.ts`, `node-icons.tsx`                           | Metadados e ícones dos tipos de node, usados pela paleta e pelo canvas.                                |
| `apps/web/src/hooks/`                                                          | 27 arquivos, um por recurso da API.                                                                    |
| `apps/web/src/components/shell/`                                               | `app-shell`, `sidebar`, `topbar`, `command-palette`, `user-menu`, `theme-toggle`, `page-transition`.   |
| `apps/web/src/components/ui/`                                                  | Primitivas shadcn/base-ui (16 componentes).                                                            |
| `apps/web/src/app/global-error.tsx`, `(app)/error.tsx`, `flows/[id]/error.tsx` | Error boundaries — um crash de render vira tela tratada e evento Sentry, não tela branca.              |
| `apps/web/src/instrumentation.ts`, `instrumentation-client.ts`                 | Init do Sentry (servidor e browser).                                                                   |
| `apps/web/DESIGN.md`                                                           | Tokens e regras visuais do redesign de 2026-07-26 — fonte de verdade atual.                            |
| `packages/ui/src/`                                                             | Design system compartilhado, source-only.                                                              |

**Componentes do editor** (`apps/web/src/components/editor/`)

| Arquivo                      | Papel                                                                  |
| ---------------------------- | ---------------------------------------------------------------------- |
| `flow-editor.tsx`            | Orquestra o canvas `@xyflow/react`, o estado do grafo e o autosave.    |
| `node-palette.tsx`           | Catálogo lateral de nodes disponíveis para arrastar.                   |
| `config-panel.tsx`           | Edição do node selecionado, incluindo a barra de presets.              |
| `workflow-node.tsx`          | Renderização de um node no canvas.                                     |
| `pulse-edge.tsx`             | Aresta animada — o ponto percorrendo a linha durante execução ao vivo. |
| `editor-toolbar.tsx`         | Ações do fluxo (salvar, executar, publicar).                           |
| `copilot-dialog.tsx`         | Geração/alteração do grafo por prompt.                                 |
| `version-history-dialog.tsx` | Histórico de versões e restauração.                                    |
| `flow-settings-dialog.tsx`   | Configurações do fluxo (nome, status, triggers, API).                  |

**Páginas web**

| Rota                                                         | Grupo             | O que faz                                                      |
| ------------------------------------------------------------ | ----------------- | -------------------------------------------------------------- |
| `/dashboard`                                                 | `(app)`           | Visão geral: métricas, execuções recentes.                     |
| `/flows`                                                     | `(app)`           | Lista de fluxos do workspace.                                  |
| `/flows/[id]`                                                | **fora de grupo** | Editor de fluxo, full-bleed.                                   |
| `/executions`, `/executions/[id]`                            | `(app)`           | Histórico e detalhe de execução (steps, logs, stream ao vivo). |
| `/agents`                                                    | `(app)`           | CRUD de agentes.                                               |
| `/knowledge`, `/knowledge/[id]`                              | `(app)`           | Bases de conhecimento e seus documentos.                       |
| `/mcp`                                                       | `(app)`           | Servidores MCP e suas ferramentas.                             |
| `/templates`                                                 | `(app)`           | Galeria de templates.                                          |
| `/analytics`                                                 | `(app)`           | Gráficos de execução e custo.                                  |
| `/cost-optimizer`                                            | `(app)`           | Sugestões de redução de custo de IA.                           |
| `/approvals`                                                 | `(app)`           | Fila interna de aprovações pendentes.                          |
| `/settings`                                                  | `(app)`           | Credenciais, variáveis, presets, alertas, aparência e idioma.  |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | `(auth)`          | Funil de entrada.                                              |
| `/approve/[token]`                                           | **pública**       | Página de decisão de aprovação, aberta por link.               |
| `/chat/[token]`                                              | **pública**       | Chat com um fluxo que tem trigger de chat.                     |
| `/inbox/[token]`                                             | **pública**       | Caixa de entrada de um fluxo com trigger de inbox.             |

## Como se conecta

- Consome **toda** a API. Cada hook em `apps/web/src/hooks/` corresponde a um controller do backend — a lista de hooks é, na prática, o inventário da superfície HTTP.
- [Autenticação e workspaces](12-auth-workspaces.md) — `auth-storage.ts` guarda os tokens e o workspace ativo; `api-client.ts` os injeta em toda request; `proxy.ts` faz o gate de página.
- [Engine de execução](01-engine-execucao.md) e [Workflows e versionamento](02-workflows-versionamento.md) — o editor lê e escreve o grafo; o formato é o do [ADR-004](../adr/004-formato-grafo.md).
- [Nodes: catálogo](03-nodes-catalogo.md) — `node-catalog.ts` e `node-icons.tsx` espelham os tipos de node de `packages/nodes`.
- [Aprovação humana](04-aprovacao-humana.md) — `/approve/[token]` e `/approvals` são as duas faces (externa e interna) do mesmo domínio; foi por causa da externa que `PUBLIC_ROUTES` existe separado de `AUTH_ROUTES`.
- [Chat e inbox](07-chat-inbox.md) — as outras duas rotas públicas por token.
- [IA da plataforma](11-ai-plataforma.md) — copiloto, autocomplete e debugger aparecem no editor; o cost optimizer tem página própria.
- [Observabilidade e deploy](14-observabilidade-deploy.md) — Sentry, error boundaries, telemetria de erro de client e o `x-request-id` que nasce aqui e atravessa API, fila e worker.

## Decisões e histórico

- [ADR-003](../adr/003-streaming-sse.md) — SSE em vez de WebSocket para acompanhar execução ao vivo; é o que o `sse-client.ts` consome.
- [ADR-004](../adr/004-formato-grafo.md) — o formato de grafo que o editor manipula.
- [ADR-010](../adr/010-observabilidade.md) §6 — a camada de frontend: error boundaries, `lib/errors.ts` centralizando o que estava duplicado em ~12 arquivos, telemetria de client, toast global deduplicado e o SSE com reconexão.
- Commit `80da213` (`fix(web): inclui /approve nas rotas publicas do proxy`) — a correção que criou a distinção entre as duas listas do middleware.
- Commit `e29f054` (2026-07-26, `redesign(web)`) — o redesign que produziu o `apps/web/DESIGN.md` atual: canvas dark, mobile, pt-BR e "O Pulso" em movimento.
- `apps/web/AGENTS.md` — aviso de que este Next.js tem breaking changes em relação ao conhecimento comum; a documentação da versão instalada está em `node_modules/next/dist/docs/`.
- **Não há ADR** para as escolhas de stack do frontend (React Query como camada de dados, Tailwind 4 + shadcn/base-ui, framer-motion, o padrão de um-hook-por-recurso). São convenções estabelecidas por uso, visíveis no código, sem decisão registrada.

## Limitações e fora de escopo

- **Há dois documentos de design e nenhum diz qual vence.** `style.md`, na raiz do repo, é de 2026-07-23 (Fase 1) e nunca mais foi tocado — está congelado. `apps/web/DESIGN.md` veio com o redesign de 2026-07-26 e é o que descreve a interface que existe hoje. Nenhum dos dois referencia o outro, e nada no repo marca o `style.md` como superado. **Tratar `apps/web/DESIGN.md` como fonte de verdade e `style.md` como histórico**; onde discordarem, o DESIGN.md ganha. Os princípios conceituais do `style.md` (cor é informação, dados em mono, movimento é causalidade, o Pulso) continuam valendo — o que envelheceu ali são os tokens e as especificações de componente.
- **`packages/ui` é source-only, sem build.** O `package.json` aponta `main`/`types` direto para `src/index.ts` e não tem script de `build` — quem consome compila o TypeScript junto. Funciona no monorepo, mas o pacote não é publicável como está.
- **`packages/ui` cobre pouco.** São quatro componentes (`pulse`, `metric-card`, `status-badge`, `empty-state`) mais o `tokens.css`. A maior parte das primitivas de UI vive em `apps/web/src/components/ui/` e não é compartilhada — a linha entre o que é design system e o que é componente do app não está desenhada.
- **O `proxy.ts` só checa a _presença_ do cookie `wf_session`,** nunca sua validade. É um gate de UX (evitar renderizar uma tela que vai falhar), não um controle de segurança — a autorização real acontece na API a cada request.
- **`PUBLIC_ROUTES` casa por prefixo** (`pathname.startsWith`). Qualquer rota futura que comece com `/chat`, `/inbox` ou `/approve` fica pública automaticamente, sem ninguém notar.
- **Sem testes de componente.** A cobertura de frontend é toda end-to-end via Playwright (`apps/e2e`); não há Vitest/Jest/Testing Library em `apps/web`, nem testes visuais ou de acessibilidade automatizados.
- **Sem Storybook** ou qualquer galeria de componentes — a única forma de ver uma primitiva é achá-la em uso na aplicação.
- **Ambiente de dev exige atenção ao host.** `NEXT_PUBLIC_API_URL` costuma apontar para o IP de LAN em vez de `localhost`, e `crypto.randomUUID()` não existe fora de contexto seguro — o `api-client.ts` já tem fallback para isso (`api-client.ts:14-31`), mas o sintoma original (login falhando sem nenhuma request aparecer na aba Network) é fácil de reencontrar em qualquer código novo que assuma `crypto` disponível.
