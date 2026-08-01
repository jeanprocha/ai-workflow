# ADR-006: Multi-tenancy por workspace desde a Fase 2

Status: Aceito
Data: 2026-07-23

## Contexto

Retrofitar multi-tenancy depois que workflows, execuções, credenciais e agentes já existem sem `workspace_id` é caro e arriscado (migração de dados, risco de vazamento entre tenants).

## Decisão

Todo recurso de negócio nasce escopado por **`workspace_id`** desde a Fase 2 (Auth + CRUD de Workflows): workflows, credentials, variables, agents, knowledge_bases, mcp_servers, schedules, templates instalados. Um guard/interceptor global no NestJS injeta e valida o workspace do usuário autenticado em toda query.

## Alternativas consideradas

- **Single-tenant no v1, multi-tenant depois**: mais rápido no curto prazo, mas exigiria migração de dados e reescrita de toda a camada de acesso a dados quando workspaces fossem introduzidos — custo maior que o investimento antecipado.

## Consequências

- Toda tabela de negócio tem `workspace_id` com índice e é sempre filtrada por ele nas queries do Prisma — nunca por `user_id` diretamente para recursos compartilháveis entre membros do workspace.
- Testes de isolamento entre workspaces fazem parte da Definição de Pronto a partir da Fase 2.
- **Exceção:** `templates` (catálogo global seedado) não tem `workspace_id` —
  é conteúdo de produto, não dado de tenant. Ainda assim, `GET /templates` e
  `POST /templates/:id/use` passam pelo `WorkspaceGuard` como qualquer outra
  rota de negócio, para não haver exceção de auth na superfície HTTP (C5,
  `docs/produto/base-evolucao.md`). Quando templates criados pelo usuário
  existirem (§3.3 da base de evolução), o model ganha `workspace_id` e a
  listagem passa a retornar globais + os do workspace.
