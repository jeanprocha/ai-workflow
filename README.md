# Workflow AI Platform

Plataforma "AI First" para criação de automações inteligentes com IA, agentes, MCP e integrações.

Veja [spec.md](spec.md) (especificação de produto), [plan.md](plan.md) (plano faseado) e [style.md](style.md) (design system).

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

## Banco de dados

O schema Prisma vive em `apps/api/prisma/schema.prisma`. Copie `apps/api/.env.example` para `apps/api/.env` antes de rodar migrations:

```bash
cp apps/api/.env.example apps/api/.env
pnpm --filter @workflow/api prisma:migrate
```

## Estrutura

```
apps/
  web/       Next.js — frontend
  api/       NestJS — API + workers (Dockerfile de produção em apps/api/Dockerfile)
packages/
  shared/    Tipos compartilhados (Workflow, Node, Execution...)
  nodes/     Registry de nodes do workflow engine
  ai/        Abstração de providers de IA + MCP client
  ui/        Design system
docs/adr/    Registro de decisões arquiteturais
docs/deploy/ Deploy em produção (Railway + Vercel)
```

## Scripts

| Comando | Descrição |
|---|---|
| `pnpm dev` | Roda web + api em modo desenvolvimento |
| `pnpm build` | Build de todos os apps/packages |
| `pnpm lint` | Lint em todo o monorepo |
| `pnpm typecheck` | Typecheck em todo o monorepo |
| `pnpm test` | Testes em todo o monorepo |
| `pnpm format` | Formata com Prettier |

## Roadmap

Ver [plan.md](plan.md) — 12 fases agrupadas em v1 (MVP), v2 (plataforma) e v3 (escala).
