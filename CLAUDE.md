# CLAUDE.md

Plataforma de automação com IA: o usuário desenha um grafo de nodes num editor visual e a plataforma executa. Monorepo pnpm + Turborepo, NestJS + Next.js, Postgres/pgvector + Redis/BullMQ.

## Onde achar as coisas

**Comece por [`docs/README.md`](docs/README.md).** Ele indexa três camadas: `docs/sistema/` descreve o estado atual do código (um doc por domínio, com mapa de arquivos), `docs/produto/` e `docs/adr/` registram o porquê histórico, e `docs/deploy/` + `docs/testing/` cobrem operação.

Antes de investigar um domínio no código, leia o doc dele em `docs/sistema/` — ele aponta os arquivos-chave e evita busca cega. Os docs são finos de propósito: para detalhes de contrato, payload ou assinatura, vá ao código.

`spec.md`, `plan.md` e `style.md` na raiz estão **congelados desde 2026-07-23** e divergem do produto real. Não use como referência.

## Comandos

```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d   # postgres:5433, redis:6380, mailpit:1025/8025
cp apps/api/.env.example apps/api/.env
pnpm --filter @workflow/api prisma:migrate
pnpm --filter @workflow/api prisma:seed           # templates globais; NÃO cria usuário
pnpm dev                                          # web:3000 + api:3333
pnpm --filter @workflow/api dev:worker            # worker — processo SEPARADO, métricas na 3334
```

`pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` · `pnpm format` · `pnpm test:e2e`

## Armadilhas conhecidas

Cada uma destas já custou tempo real neste projeto.

**O worker não sobe com `pnpm dev`.** Sem ele, execuções nascem `queued` e nunca saem de lá. Se um teste ou verificação manual depende de execução, o worker precisa estar rodando.

**Nunca rode `build` de um app cujo `pnpm dev` está ativo** — corrompe `dist/`/`.next` e derruba o processo em execução. Pare o dev primeiro, ou faça build de outro app.

**Migrations e o índice HNSW.** Gere sempre com `--create-only`, abra o `migration.sql` e confira antes de aplicar: o Prisma não conhece o índice HNSW de `chunks.embedding` e gera um `DROP INDEX chunks_embedding_hnsw_idx` espúrio por drift. Isso já derrubou o índice em produção mais de uma vez. Das migrations de 2026-07-30 em diante, todas trazem um comentário no topo registrando que o DROP foi removido à mão. E **nunca edite uma migration já aplicada** — o checksum quebra e o Prisma pede reset do banco.

**Ambiente local usa IP de LAN.** O dev server web responde em `http://192.168.1.100:3000`, não em `localhost:3000`. Para Playwright local, exporte `E2E_BASE_URL=http://192.168.1.100:3000` e `E2E_API_URL=http://192.168.1.100:3333` — o fixture `request` trava em `localhost` nesta máquina.

**`pkill` em nest/next nem sempre mata o wrapper.** Depois de matar processos de dev, confirme com um `ps aux` amplo antes de subir de novo, ou a porta continua ocupada por um zumbi.

**Adicionar um node toca mais que `packages/nodes`.** A definição vive lá, mas o painel de config (`apps/web/src/components/editor/config-panel.tsx`), o mapa de ícones e o dicionário i18n precisam ser atualizados junto, senão o node aparece sem UI. A checklist completa está em [`docs/sistema/03-nodes-catalogo.md`](docs/sistema/03-nodes-catalogo.md).

**Não mantenha listas de status à mão.** Para saber se uma execução terminou, derive de `EXECUTION_PHASE` (`packages/shared/src/execution.ts`). Listas paralelas mantidas manualmente já causaram bug em produção (a Flow API retornava 200 com output nulo para execução apenas pausada).

## Convenções

- **Tudo em português-BR**: código de UI, docs, mensagens de commit, comentários.
- **Commits** no formato convencional com escopo: `feat(web):`, `fix(flow-api):`, `docs:`, `test(e2e):`.
- **Docs registram o negativo.** Convenção forte do repo: toda spec tem "Fora de escopo (deliberado)", e o que não foi feito, não foi verificado ou foi refutado é escrito explicitamente. Mantenha isso.
- **Evidência `arquivo:linha`** ao afirmar algo sobre o código em documentos.
- Formatação por Prettier, inclusive nos `.md`.

## Manutenção da documentação

**Toda mudança funcional atualiza o doc do domínio em `docs/sistema/`, no mesmo commit**, incluindo o carimbo `> Última revisão: AAAA-MM-DD · commit ...` do topo do arquivo.

Conta como mudança funcional: rota nova ou removida, model novo no Prisma, fila nova, mudança de comportamento observável, limitação que deixou de existir. Não conta: refactor interno, renomeação, ajuste de estilo.

Os documentos de `docs/produto/` e `docs/adr/` são imutáveis — decisão que mudou vira ADR novo que supera o anterior, nunca edição do antigo.

A skill `/doc-sync` audita a defasagem entre os carimbos e o histórico do git.
