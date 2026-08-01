# SPEC H2-01 — Correções baratas de passagem

Data: 2026-07-30. Origem: bugs e riscos encontrados de passagem no
[`discovery-h2.md`](discovery-h2.md) (seção "Bugs e riscos"). É o item 1 da
ordem sugerida do H2. Escopo deliberadamente pequeno: cinco correções
independentes entre si, nenhuma muda arquitetura, todas com evidência
confirmada no código em 2026-07-30.

Estimativa total: ½ a 1 dia incluindo testes. As correções são independentes
— podem ser feitas e commitadas em qualquer ordem (sugestão: C → A → B → E →
D, do maior valor para o menor).

**Status: implementado em 2026-07-30** (as cinco correções, com specs
unitários novos e e2e do gate — ver plano de implementação). Três divergências
confirmadas durante a implementação em relação a este spec original, sinalizadas
inline abaixo: o gate da correção A cobre 3 métodos do chat (não 2); a
correção C usa 400 em vez de 422 (convenção do repo); e o item 2 da correção E
("verificar consumidores no web") não achou nada a mudar.

---

## Correção A — Fluxo arquivado continua executando (webhook + chat)

**Problema.** `workflow.status` só afeta o agendamento cron
(`workflows.service.ts:143-155`). Um fluxo arquivado — que o usuário acredita
ter "desligado" no toggle de `/flows` — continua aceitando webhooks e
mensagens de chat público, criando execuções e gastando tokens de IA
indefinidamente.

**Evidência.** `apps/api/src/executions/executions.service.ts:49-62`
(`triggerByWebhook` faz só `findUnique({ webhookId })`);
`apps/api/src/chat/chat.service.ts:20-29` (`getWorkflowByChatToken`, idem).

**Mudança proposta.**
1. Em `triggerByWebhook` (`executions.service.ts:53-55`): após resolver o
   workflow, se `workflow.status === 'archived'`, lançar
   `NotFoundException('Webhook nao encontrado.')` — mesma mensagem do caso
   inexistente, para não vazar a existência do recurso (a URL é capability).
2. Em `getWorkflowByChatToken` (`chat.service.ts:20-29`): idem, com a
   mensagem já existente `'Link de chat invalido ou expirado.'`. **Correção
   ao investigar a implementação:** o método é usado por **3** chamadores, não
   2 — `createConversation`, `postVisitorMessage` **e `listMessages`**. O gate
   também bloqueia a leitura do histórico de um fluxo arquivado (decisão
   confirmada com o usuário: arquivar mata o link de chat por completo).
3. **Não tocar** `getWorkflowByInboxToken`: o inbox não dispara fluxo e o
   operador precisa continuar lendo o histórico de um fluxo arquivado.

**Decisões (e alternativas rejeitadas).**
- Bloquear **somente `archived`**. `draft` continua disparando: é o
  comportamento atual usado para testar fluxo antes de ativar (templates
  instanciam como `draft`), e exigir `active` para webhook/chat é mudança de
  produto — fica anotada como questão aberta para o tema "publicar como API"
  (gating por status/versão publicada).
- Execução manual pelo editor (`POST /workflows/:id/run`) não gateia.
- 404 em vez de 410: não vazar existência > semântica HTTP fina.
- Quando o `trigger.whatsapp` existir, o mesmo gate se aplica ao resolver o
  workflow do webhook da Meta.

**Critérios de aceite.**
- Arquivar um fluxo → `POST /hooks/:webhookId` responde 404 e **nenhuma**
  Execution é criada.
- Arquivar um fluxo → `POST /public/chat/:chatToken/conversations` e
  `.../messages` respondem 404; nenhuma execução disparada.
- Reativar o fluxo → ambos voltam a funcionar sem outra ação.
- Inbox (`/public/chat-inbox/:inboxToken`) continua funcionando com o fluxo
  arquivado.

**Testes.** E2E (padrão de `apps/e2e/tests/flows/templates.spec.ts`, chamadas
de API autenticadas): criar fluxo com webhook → arquivar via
`PATCH /workflows/:id` → POST no hook espera 404 → reativar → espera 201.
Análogo para chat público.

---

## Correção B — `logic.delay` aceita 300s mas o sandbox mata em 30s

**Problema.** O config do delay aceita até 300.000ms
(`packages/nodes/src/definitions/delay.ts:5`), mas o sandbox termina qualquer
node em 30s (`NODE_SANDBOX_TIMEOUT_MS`, `engine.service.ts:22`;
`node-sandbox-runner.ts:82-89`). Qualquer delay > 30s falha sempre, com
mensagem de timeout que não explica a causa real.

**Mudança proposta.** Timeout do sandbox **por node** no call site — em
`engine.service.ts:599` o options `{ timeoutMs, memoryLimitMb }` já é passado
por chamada. Para `node.type === 'logic.delay'`, calcular:

```
timeoutMs = clamp(Number(resolvedConfig.ms) || 0, 0, 300_000) + NODE_TIMEOUT_MS
```

(a config resolvida está disponível nesse ponto; o `Number(...)` protege
contra valor vindo de expressão; o clamp usa o mesmo teto do schema; a soma
com `NODE_TIMEOUT_MS` mantém a margem padrão para o overhead do worker).

**Decisões (e alternativas rejeitadas).**
- **Rejeitada**: reduzir o max do schema para ~25s — quebra o contrato
  documentado do node (até 5 min) e delay longo é caso de uso legítimo
  (ex.: aguardar processamento externo curto).
- Aceito como limitação conhecida: um delay longo ocupa 1 dos 5 slots de
  concorrência do worker durante toda a espera. Registrar isso no hint do
  campo no painel (i18n pt/en em `dictionaries/editor.ts`). Espera durável
  de verdade (fora do worker) é parte do tema "aprovação humana" no
  discovery e não entra aqui.

**Critérios de aceite.**
- Fluxo com `logic.delay` de 45s executa com sucesso (era falha certa).
- Delay curto (1s) continua com o comportamento atual.
- Nenhum outro tipo de node muda de timeout.

**Testes.** Unit em `engine.service.spec.ts`: mock do sandbox runner
capturando o `timeoutMs` recebido — para `logic.delay` com `ms: 45000`
espera `45000 + NODE_TIMEOUT_MS`; para um node comum espera
`NODE_TIMEOUT_MS`.

---

## Correção C — `use()` de template sem validação e sem tokens de chat

**Problema.** `TemplatesService.use()` (`templates.service.ts:14-49`):
1. Não valida o grafo do template com `workflowGraphSchema` — um template com
   `node.type` inexistente ou shape inválido entra no banco e só quebra em
   runtime (diferente de `saveGraph`, que valida —
   `workflows.service.ts:174-180`).
2. Chama só `ensureWebhookId` (`:22`), não `ensureChatTokens` (compare
   `workflows.service.ts:187-188`). Template com `trigger.chat` gera fluxo
   com `chat_token`/`inbox_token` **nulos nas colunas** — e o lookup do chat
   público é pela coluna (`chat.service.ts:21-22`), então o chat do fluxo
   instanciado não funciona. Se o grafo do template trouxer tokens de um
   fluxo de origem, eles ficam órfãos no JSON.

**Mudança proposta**, em `templates.service.ts`:
1. Após o `findUnique`, validar com
   `workflowGraphSchema.safeParse(template.graph)`; em falha, lançar
   `BadRequestException({ message: 'Template invalido ou incompativel com a versao atual.', issues })`.
   **Correção ao investigar a implementação:** trocado de
   `UnprocessableEntityException` (422) para `BadRequestException` (400) —
   `UnprocessableEntityException` tem zero ocorrências em todo o repo, e a
   convenção estabelecida para reprovação do **mesmo schema**
   (`workflowGraphSchema`) é `BadRequestException({message, issues})`
   (`workflows.service.ts:176`, para `saveGraph`). Manter 422 aqui criaria
   dois status diferentes para a mesma causa de falha.
2. Antes dos `ensure*`, **zerar tokens herdados** no grafo: em todo node,
   limpar `config.webhookId`, `config.chatToken`, `config.inboxToken` se
   presentes. (Defesa contra template salvo a partir de fluxo real — evita
   colisão com os `@unique` de `workflows.webhook_id`/`chat_token` na
   segunda instanciação, já que `ensureWebhookId` preserva valor existente,
   `workflows.service.ts:33-35`. A sanitização completa de
   credenciais/agentId/etc. fica no tema Templates CRUD.)
3. Chamar `ensureChatTokens` além de `ensureWebhookId` (exportar de
   `workflows.service.ts` se ainda não exportado) e espelhar
   `chatToken`/`inboxToken` no `tx.workflow.create` — o `webhookId` já é
   espelhado (`templates.service.ts:32`).

**Critérios de aceite.**
- Instanciar template com `trigger.chat` → workflow criado com
  `chat_token`/`inbox_token` preenchidos nas colunas e presentes no grafo; o
  link de chat público do fluxo novo funciona.
- Instanciar o mesmo template duas vezes → dois fluxos com tokens distintos,
  sem erro P2002.
- Template com grafo inválido → 400 com `{message, issues}`; nada é criado.
- Os 7 seeds atuais continuam instanciáveis (nenhum tem `trigger.chat` com
  token preenchido; regressão coberta pelo e2e existente
  `templates.spec.ts:71-102`).

**Testes.** Novo `templates.service.spec.ts` (unit, prisma mockado — padrão
de `engine.service.spec.ts`): grafo inválido → `BadRequestException`; grafo
com `trigger.chat` → create recebe `chatToken`/`inboxToken` não nulos; grafo
com tokens pré-preenchidos → tokens são regenerados (≠ dos originais).
**Armadilha encontrada na implementação:** `graph.schema.ts` importa
`@workflow/nodes/catalog`, que resolve para o dist ESM puro do pacote — o
jest do apps/api roda ts-jest em CJS e quebra ao importar isso. Resolvido com
`jest.mock('@workflow/nodes/catalog', ...)` no topo do spec (stub local de
`getCatalogEntry`), sem tocar a config global do jest.

---

## Correção D — Docblock do AI Debugger desatualizado

**Problema.** O comentário de classe diz que "fallback fica informativo, ja
que a engine e fail-fast e nao tem um mecanismo de fallback entre nodes hoje"
(`debugger.service.ts:61-66`) — mas desde a correção C3 o Debugger **aplica**
a sugestão de fallback como patch `onError:'branch'`
(`debugger.service.ts:311-314`, aplicável em `:178-181`).

**Mudança proposta.** Reescrever o docblock: retry/timeout/fallback são todos
aplicáveis com um clique; fallback vira `onError:'branch'` no node (o usuário
ainda precisa conectar a edge de erro no editor). Sem mudança de código.

**Critérios de aceite.** Comentário condiz com o comportamento. Sem teste.

---

## Correção E — `TriggerType` do shared sem `"chat"`

**Problema.** `packages/shared/src/execution.ts:8` declara
`TriggerType = "manual" | "webhook" | "cron" | "event"`, mas o Prisma tem
`chat` (`schema.prisma:239-245`) e execuções de chat existem em produção — o
front tipa essas execuções errado.

**Mudança proposta.**
1. Adicionar `"chat"` à union em `packages/shared/src/execution.ts:8`.
2. Verificar consumidores no web (`apps/web`): filtros/labels de trigger na
   lista de execuções e no detalhe — se houver mapa de labels por
   `TriggerType`, adicionar a entrada `chat` (i18n pt/en).
   **Correção ao investigar a implementação:** item vazio — nenhum arquivo do
   web importa `TriggerType` do shared (o web redeclara a união localmente,
   ex.: `use-executions.ts` usa `triggerType: string` solto) e não existe
   mapa de labels nem filtro por trigger. Nada a mudar no web; registrado
   como dívida técnica separada (o web deveria importar do shared em vez de
   duplicar a união).

**Critérios de aceite.** `pnpm -r typecheck` (ou build) verde; execução de
chat exibida com trigger correto na UI de execuções.

**Testes.** Coberto pelo typecheck; ajuste visual verificado nas execuções
existentes de chat.

---

## Fora de escopo (deliberado)

- **Deadlock do `logic.merge` com edge de erro** (execução `success`
  incompleta silenciosa) → tema "error handling" (item 6 da ordem do
  discovery); a correção certa envolve semântica de join, não é barata.
- **Alerting cego a falhas tratadas por `onError:'branch'`** → decisão de
  produto pendente (notificar ou não falha tratada).
- **`env: {}` no worker do sandbox** → pré-requisito do node de código
  (item 4); mudança de 1 linha mas com risco de regressão em nodes que
  leiam env — merece o teste de integração do tema.
- **Gating de `draft` em webhook/chat e versão publicada ≠ versão de edição**
  → tema "publicar como API" (item 5).
- **Espera durável / delay fora do worker** → tema "aprovação humana"
  (item 7).
