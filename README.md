# Workflow AI Platform

Plataforma "AI First" para criação de automações inteligentes com IA, agentes, MCP e integrações.

**A documentação começa em [docs/README.md](docs/README.md)** — de lá saem o estado atual do sistema (um doc por domínio em [docs/sistema/](docs/sistema/00-visao-geral.md)), as decisões arquiteturais e o histórico de produto.

Os arquivos [spec.md](spec.md), [plan.md](plan.md) e [style.md](style.md) na raiz estão congelados desde 2026-07-23 e são material histórico.

## Setup

Pré-requisitos: Node 20+, pnpm 9+, Docker.

```bash
pnpm install
```

```bash
docker compose -f docker-compose.dev.yml up -d
```

```bash
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:3333 (healthcheck em `/health`)

O docker compose sobe Postgres em `5433`, Redis em `6380` e o Mailpit (SMTP de desenvolvimento) em `1025` / `8025`. Em máquinas onde o `apps/web/.env` aponta para um IP de LAN, use esse endereço em vez de `localhost` — ver [CLAUDE.md](CLAUDE.md).

## Banco de dados

O schema Prisma vive em `apps/api/prisma/schema.prisma`. Copie `apps/api/.env.example` para `apps/api/.env` antes de rodar migrations:

```bash
cp apps/api/.env.example apps/api/.env
pnpm --filter @workflow/api prisma:migrate
```

O seed popula o catálogo de templates globais (não cria usuário — a primeira conta sai de `/register`):

```bash
pnpm --filter @workflow/api prisma:seed
```

## Estrutura

```
apps/
  web/       Next.js — frontend
  api/       NestJS — dois entrypoints: API HTTP e worker de filas
             (Dockerfile de produção em apps/api/Dockerfile)
packages/
  shared/    Tipos compartilhados (Workflow, Node, Execution...)
  nodes/     Registry de nodes do workflow engine
  ai/        Abstração de providers de IA + MCP client
  ui/        Design system
docs/sistema/ Estado atual do sistema, um doc por domínio
docs/adr/     Registro de decisões arquiteturais
docs/produto/ Histórico de evolução (planos, discoveries, specs)
docs/deploy/  Deploy em produção (Railway + Vercel)
```

O worker é um processo separado e **não** sobe com `pnpm dev`:

```bash
pnpm --filter @workflow/api dev:worker
```

## Scripts

| Comando          | Descrição                               |
| ---------------- | --------------------------------------- |
| `pnpm dev`       | Roda web + api em modo desenvolvimento  |
| `pnpm build`     | Build de todos os apps/packages         |
| `pnpm lint`      | Lint em todo o monorepo                 |
| `pnpm typecheck` | Typecheck em todo o monorepo            |
| `pnpm test`      | Testes em todo o monorepo               |
| `pnpm test:e2e`  | Suíte Playwright (exige serviços de pé) |
| `pnpm format`    | Formata com Prettier                    |

## Roadmap

Ver [docs/produto/base-evolucao.md](docs/produto/base-evolucao.md) — o documento-mestre de evolução, com os três horizontes H1 (concluído), H2 e H3.
