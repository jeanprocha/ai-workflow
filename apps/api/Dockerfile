# Imagem unica usada pelos dois servicos do Railway (Fase 10, ADR-008):
# "api" (HTTP, CMD padrao) e "worker" (fila, start command sobrescrito no
# proprio servico do Railway — ver docs/deploy/railway.md). Mesmo codebase,
# processos separados: matar um worker nao afeta a API nem outros workers.

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# --- deps: so os manifests, para cachear a instalacao entre builds ---
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/nodes/package.json packages/nodes/package.json
COPY packages/ai/package.json packages/ai/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile

# --- build: codigo completo, compila os pacotes internos + api ---
FROM deps AS build
COPY . .
RUN pnpm --filter @workflow/shared --filter @workflow/ai --filter @workflow/nodes build
RUN pnpm --filter @workflow/api exec prisma generate
RUN pnpm --filter @workflow/api build

# --- runtime: so o necessario para rodar (sem devDependencies de build) ---
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/api

# Padrao: processo da API (HTTP). O servico "worker" no Railway sobrescreve
# o Start Command para "node dist/src/worker.main.js" — mesma imagem, sem
# rebuild separado.
EXPOSE 3333
CMD ["node", "dist/src/main.js"]
