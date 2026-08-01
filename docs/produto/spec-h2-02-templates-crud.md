# SPEC H2-02 — Templates CRUD

Data: 2026-07-30. Origem: item 2 da ordem sugerida do H2
([`discovery-h2.md`](discovery-h2.md) §6). Meta de produto: galeria rica +
"salvar fluxo como template" — o que torna o "Vendas via Chat" replicável
para qualquer PME, critério de sucesso do H2. Pré-requisito já entregue pelo
H2-01: o `use()` valida o grafo e zera tokens herdados antes de instanciar.

**Status: implementado em 2026-07-30**, em 4 commits, com specs unitários,
e2e novo e regressão do `templates.spec.ts` original — todos verdes.

---

## Decisões de arquitetura

1. **Escopo**: `workspace_id String?` nullable no model — `null` = template
   global (os 7 seeds, intocados), preenchido = do workspace. Listagem =
   globais + do workspace (`OR: [{workspaceId: null}, {workspaceId}]`).
   **Sem `is_public`** — marketplace está deliberadamente fora
   (`base-evolucao.md` §4).
2. **Permissões v1**: qualquer membro do workspace cria/edita/deleta os
   templates do próprio workspace; templates globais são read-only (mesmo
   404 de "não encontrado" para quem tenta editar/deletar um global ou de
   outro workspace). Sem RBAC — `workspaceRole` continua sem consumidor,
   fica para o H3.
3. **Criação por referência**: `POST /templates` recebe
   `{ name, description?, category, workflowId, versionId? }` — o servidor
   busca o grafo da versão (default `currentVersion`), valida ownership,
   sanitiza e só então valida com `workflowGraphSchema`. O cliente nunca
   envia grafo cru — elimina a superfície de "template envenenado".
4. **PATCH só de metadados** (name/description/category). Reapontar o
   template pra outro fluxo/versão via PATCH não é aceito nem pelo DTO
   (`PickType` exclui `workflowId`/`versionId` antes do `PartialType`).
5. **Isolamento por 404**: `findFirst({id, workspaceId})` — template global
   ou de outro workspace cai no mesmo `404 'Template nao encontrado.'`. Sem
   distinguir "não existe" de "não é seu".
6. **`category` continua string livre.**

## Sanitização do grafo — decisões confirmadas

| Política | Escolha | Por quê |
|---|---|---|
| `config.credential` | **manter (`keep`)** | Guarda o *nome* da conexão, nunca o segredo (resolvido por workspace+nome na engine). Templates são intra-workspace no v1 — o nome resolve certo, e o fluxo instanciado já nasce funcionando, igual aos seeds (`anthropic-default`). |
| `headers`/`query` (node HTTP e GraphQL) | **só chaves sensíveis (`sensitive-keys`)** | Zera valores cuja chave case com `/authorization\|api[-_]?key\|secret\|token\|password/i`; preserva `Content-Type` e afins. Template continua utilizável sem reconfigurar cabeçalhos inócuos. |

Ambas viram constantes exportadas em
`apps/api/src/templates/template-sanitizer.ts` (`CREDENTIAL_POLICY`,
`RECORD_POLICY`), trocáveis numa linha quando templates puderem ser
compartilhados entre workspaces (aí vira `clear`/`all`).

Sempre removidos, sem política: `webhookId`/`chatToken`/`inboxToken`
(capability do fluxo de origem — ficam ausentes, não vazios, para o
`ensureWebhookId`/`ensureChatTokens` gerarem token novo na instanciação);
`agentId`/`knowledgeBaseId`/`mcpServerId` (ids de recurso do workspace de
origem, zerados para `''` — o estado "não configurado" da UI);
`signature.secret` do node HTTP (zerado, demais subcampos preservados).

**Limitação conhecida e documentada no código:** `url` e `body` do
`api.httpRequest` podem carregar segredo embutido (querystring, basic-auth,
token no corpo) — sanitizá-los quebraria o template na maioria dos casos
legítimos. Fica por conta de quem publica revisar antes de compartilhar.

## O que foi construído

**Backend** (`apps/api/src/templates/`):
- Migration `20260730211846_template_workspace_scope` — `workspace_id`
  nullable + `@@unique([workspaceId, name])` + FK `onDelete: Cascade`.
- `template-sanitizer.ts` (novo) — `sanitizeTemplateGraph()` +
  `stripInheritedTokens()` (migrado do service).
- `dto/create-template.dto.ts` e `dto/update-template.dto.ts` (novos).
- `templates.service.ts` — `scopeWhere()` usado em `list()`/`use()`; `create`
  (busca fluxo por ownership, resolve versão, sanitiza, valida, salva);
  `findOwned()` como gate de `update`/`remove`; conflito de nome via
  `findFirst` (nunca `findUnique` no índice composto — `workspaceId` NULL
  usa NULLS DISTINCT no Postgres).
- `templates.controller.ts` — `POST/PATCH/DELETE` novos, `GET` ganha escopo.
- `search.service.ts` — o branch de templates no command palette ganhou o
  mesmo `OR` de escopo (era o único sem `workspaceId` no `where`).
- `templates.service.spec.ts` — 21 testes (6 originais + 15 novos): escopo
  de `list`/`use`, sanitização campo a campo (incluindo o guard de tipo que
  protege `query` string do `knowledge.search`/SQL do `database.postgres` de
  serem tratados como record), conflito de nome, ownership, fluxo/versão
  inexistente ou sem versão salva.

**Frontend** (`apps/web`):
- `use-templates.ts` — `Template.workspaceId`, hooks `useCreateTemplate`/
  `useUpdateTemplate`/`useDeleteTemplate`.
- `templates/page.tsx` — busca + filtro de categoria client-side (sobre o
  valor traduzido de `getTemplateCopy`), badge oficial×workspace (estreia do
  `ui/badge.tsx`), menu de editar/excluir só nos templates do workspace,
  `EditTemplateDialog`/`DeleteTemplateDialog` no molde dos dialogs de fluxo.
- `flows/page.tsx` — item "Salvar como template" no menu do card +
  `SaveAsTemplateDialog` (criação por referência, sem precisar do grafo).
- i18n em `dictionaries/templates.ts` e `dictionaries/flows.ts` (pt + en).

**E2E**: `apps/e2e/tests/flows/templates-crud.spec.ts` (novo, 8 testes) —
sanitização observável via `GET /templates`, PATCH de metadados, 404 em
template global, DELETE, conflito de nome, `use()` do template criado,
isolamento entre dois workspaces (inclusive no `use()`, que ganhou escopo),
e um teste de UI (busca, badge, menu, exclusão). `templates.spec.ts`
original não foi tocado e continua verde (contrato preservado: `GET
/templates` devolve `graph.nodes`, `templates[0]` continua sendo seed,
botão "Usar template" literal).

## Verificação

```bash
pnpm --filter @workflow/api typecheck && pnpm --filter @workflow/api test
pnpm --filter @workflow/web typecheck && pnpm --filter @workflow/web lint
pnpm --filter @workflow/e2e e2e tests/flows/templates.spec.ts tests/flows/templates-crud.spec.ts
```

Resultado: 73→94 testes unitários do api (21 novos em templates), typecheck
limpo em shared/api/web, 15/15 e2e (templates + templates-crud +
archived-gate). Sem acesso a Chrome interativo neste ambiente para QA manual
— a validação de UI ficou por conta do teste e2e de UI (browser real via
Playwright), que cobre busca, badge, menu e exclusão.

## Fora de escopo (deliberado)

- Marketplace / `is_public` / compartilhamento entre workspaces.
- Preview com mini-canvas ou thumbnail (chips de `node.label` continuam).
- RBAC por papel em templates → H3.
- Re-snapshot do grafo no PATCH e versionamento de template.
- Busca/filtro server-side (`?q=`/`?category=`) — client-side cobre o
  catálogo atual; migrar quando o volume justificar.
