# ADR-001: Prisma como ORM

Status: Aceito
Data: 2026-07-23

## Contexto

A engine de execução, o editor visual e a camada de IA dependem de um modelo de dados que evolui rápido durante o v1 (workflows, execuções, agentes) e continua crescendo no v2/v3 (MCP, knowledge, marketplace). Precisamos de velocidade de iteração em schema e migrations sem abrir mão de type-safety.

## Decisão

Usar **Prisma** (fixado em v6, ver nota abaixo) como ORM único, com `schema.prisma` em `apps/api/prisma` como fonte da verdade do banco, migrations versionadas em `prisma/migrations`.

Nota de versão: o Prisma v7 mudou o fluxo de conexão (exige driver adapters e `prisma.config.ts` em vez de `url` no datasource). Fixamos v6 para manter o fluxo clássico `DATABASE_URL` no schema, mais simples para o estágio atual do projeto. Revisitar a migração para v7 quando os adapters estabilizarem.

## Alternativas consideradas

- **Drizzle**: mais próximo de SQL puro e leve, mas menos ferramental de migration/introspection pronto e comunidade menor no momento da decisão.
- **TypeORM**: maduro, mas API de migrations e decorators mais verbosa; menor produtividade percebida para iteração rápida de schema.
- **SQL puro + query builder**: máximo controle, mas perde geração de tipos e velocidade de prototipagem que o produto precisa nas fases iniciais.

## Consequências

- Client tipado gerado automaticamente a partir do schema, usado por `apps/api` (e por `packages/shared` via re-export de tipos quando fizer sentido).
- Migrations reversíveis e versionadas entram na Definição de Pronto de toda fase (plan.md §7).
- pgvector (ADR-002) é habilitado via `previewFeatures = ["postgresqlExtensions"]` no generator.
