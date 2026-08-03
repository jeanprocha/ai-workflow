# Discovery — o que falta para as automações de mercado

Data: 2026-08-03 · commit base `6d1de59`. Quatro investigações paralelas
somente-leitura sobre o código atual, motivadas pela pergunta: **o que falta
para a plataforma conseguir fazer a maioria das automações do mercado?**
Cada afirmação carrega evidência `arquivo:linha`. Nada foi alterado durante o
levantamento.

Temas: OAuth como método de credencial · sistema de expressões `{{ }}` ·
triggers de polling · composição e dados (sub-workflows, iteração por item,
binário, paginação).

Este documento é irmão do [`discovery-h2.md`](discovery-h2.md) em formato e
propósito: mapa "já existe / falta construir" para virar specs depois. Ele
**não** substitui o H3 de [`base-evolucao.md`](base-evolucao.md) §5 — há
sobreposição em OAuth e sub-workflows, mas a pergunta aqui é outra
(integrações de mercado, não roadmap interno).

---

## Leitura executiva

A plataforma é forte no que é difícil (pausa durável, IA de primeira classe,
sandbox real, versionamento com replay) e fraca no que é chato — e o chato é
o que o mercado usa todo dia. Quatro lacunas, em ordem de alavancagem:

1. **OAuth** destrava a categoria inteira de integrações SaaS, e a fundação é
   surpreendentemente favorável: o contrato `getCredential(name): string` é
   deliberadamente opaco, então entregar um access_token renovado **não exige
   tocar em nenhum dos ~15 nodes de integração existentes**. Tamanho de uma
   entrega H2 média.
2. **Expressões** confirmadas como só-travessia: zero computação. Mas o gap
   mais caro não é a gramática — é a UI assistida (autocomplete, preview), que
   as três referências de mercado (n8n, Zapier, Make) mostraram ser
   obrigatória para o não-dev.
3. **Polling** não existe, mas o esqueleto cron cobre ~60% do caminho e o
   repo já tem o molde exato do cursor persistente (`Conversation.state`).
4. **Composição**: sub-workflow é o melhor custo-benefício do documento
   inteiro (a pausa durável genérica já resolve a espera); **iteração por
   item é o item mais caro de todos** — mexe no invariante central da engine;
   binário não trafega (e o node HTTP corrompe download binário hoje);
   paginação automática não existe, mas é barata.

Bugs e surpresas encontrados de passagem estão na seção final.

---

## 1. OAuth como método de credencial

### Veredicto

A fundação está pronta. O trabalho real é um módulo novo (start/callback/state/
refresh com lock) mais a consolidação de cinco pontos duplicados de decrypt e a
UI de "Conectar". Nada exige refazer o sistema de credenciais. Análogo mais
próximo em tamanho: a Flow API (H2-04).

### Já existe

| Item                                                                                                                                                                                                             | Evidência                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `Credential` com `kind` string livre (`"secret"` \| `"fields"`) — um `kind: "oauth"` entra sem migration de enum                                                                                                 | `apps/api/prisma/schema.prisma:198`                               |
| Criptografia AES-256-GCM pronta; o blob `{access_token, refresh_token}` cabe em `encryptedData` como o `fields` já faz                                                                                           | `apps/api/src/crypto/crypto.service.ts:28-54`                     |
| **O contrato-chave**: `ctx.getCredential(name)` devolve string opaca, via RPC do sandbox até `engine.service.ts:1168-1179`; o comentário em `credentials.service.ts:74-77` registra que a opacidade é deliberada | `packages/nodes/src/types.ts:16`                                  |
| Molde de controller público com guard próprio (para o callback): Flow API com `@Public()` na classe + guard de API key                                                                                           | `apps/api/src/flow-api/flow-api.controller.ts:52-62`              |
| Molde de token com estado, TTL e uso único (para o `state` OAuth): `PasswordResetToken`                                                                                                                          | `docs/sistema/12-auth-workspaces.md:64`                           |
| Molde de job periódico (renovação antecipada): fila `mcp-health`                                                                                                                                                 | `apps/api/src/mcp/mcp-health.processor.ts:14-32`                  |
| Molde de conexão com estado para a UI (conectado/expirado/erro): `McpServer.status/lastError`                                                                                                                    | `schema.prisma:606-608`                                           |
| Já existe UMA troca OAuth no repo: Google Drive faz JWT-bearer de Service Account — mas **dentro do sandbox**, desenho que não deve ser copiado para OAuth de usuário (ver armadilhas)                           | `packages/nodes/src/definitions/google-drive-list-files.ts:14-51` |
| ~15 nodes que hoje pedem token manual e se beneficiariam: Telegram, GitHub, WhatsApp, Linear, Stripe, Notion, HTTP `$auth`, SMTP, bancos, nodes de IA                                                            | `packages/nodes/src/definitions/`                                 |

### Falta construir

1. Módulo `oauth/`: `GET /oauth/:provider/start` (autenticado, gera `state`
   persistido com workspaceId/TTL/uso único) e `GET /oauth/callback`
   (`@Public()` + validação de state + rate limit). **Médio.**
2. Colunas novas em claro no `Credential` (mesmo racional do `fieldsMeta`):
   `expiresAt`, `scopes`, `oauthProvider`, `status` — a UI nunca abre o blob.
   **Pequeno** (migration com `--create-only`, armadilha HNSW).
3. **O miolo**: renovação on-demand dentro do resolve de credencial — se
   `kind === "oauth"` e `expiresAt` próximo, renova antes de devolver, com
   **lock Redis obrigatório** (providers com refresh-token rotation invalidam
   a conexão se duas renovações correrem juntas). **Médio.**
4. Pré-requisito: consolidar o `findFirst+decrypt` que está copiado em
   **cinco lugares** (engine, agents/tools, autocomplete, debugger, knowledge
   — `agents/tools.ts:23-29`, `autocomplete.service.ts:219-227`,
   `debugger.service.ts:278-286`, `knowledge.service.ts:172`) num
   `CredentialsService.resolve()` único; sem isso, quatro caminhos devolvem
   token expirado. **Pequeno-médio.**
5. `client_id`/`client_secret` por provedor: começar com env
   (`GOOGLE_OAUTH_CLIENT_ID`...); "traga seu app" por workspace fica para
   depois. **Pequeno.**
6. Frontend: botão "Conectar" por provedor em `/settings`, popup, badge de
   estado. O `CredentialSelect` não muda (resolve por nome). **Médio.**

### Armadilhas específicas deste código

- **O timer de 30s do sandbox corre durante o RPC** (`engine.service.ts:26`,
  `node-sandbox-runner.ts:130-137`): renovação lenta vira "timeout do node",
  não "OAuth falhou". Timeout curto e dedicado no fetch de refresh +
  renovação antecipada por job.
- **A allowlist de env do sandbox obriga o desenho certo**: `client_secret`
  não vaza para o worker_thread (`node-sandbox-runner.ts:56-68`), então toda
  troca/renovação vive no main thread. O Google Drive atual viola isso (troca
  dentro do sandbox) — funciona porque Service Account não tem secret de
  plataforma; não copiar.
- **Callback chega sem JWT**: o vínculo com o workspace vai no `state`
  persistido (hash + TTL + uso único), nunca em query param em claro.
- **Refresh tokens agravam a pendência de rotação da
  `SECRETS_ENCRYPTION_KEY`** (`12-auth-workspaces.md:109`): a chave passa a
  proteger segredos de vida longa.
- **Dev local usa IP de LAN**: providers OAuth só aceitam `localhost` ou
  domínio público como redirect — testar o callback local exigirá ajuste.

---

## 2. Sistema de expressões

### Veredicto

Hipótese confirmada: travessia por ponto e nada mais, com `logic.code` e
`transformList` como únicas saídas — e o code node **não vê `$node.*`** nem
tem rede. O raio de mudança da gramática é contido (um arquivo, contrato de
30 testes, não é consumida pelo editor), mas o gap mais caro é a UI assistida,
não a gramática.

### Já existe

| Item                                                                                                                                               | Evidência                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Gramática: regex `/\{\{\s*([^}]+?)\s*\}\}/g` — sem parser; o corpo **nunca pode conter `}`**                                                       | `packages/nodes/src/expressions.ts:47`           |
| Raízes hard-coded: `$input`, `$vars`, `$node.<id>.<path>` + `extraRoots` dinâmicas (só o HTTP usa: `$auth`, `$sig`, resolvidas em segunda passada) | `expressions.ts:80-103`; `http-request.ts:14-25` |
| Tipo preservado se a string é exatamente 1 expressão; interpolada vira string (`null`→`""`, objeto→JSON)                                           | `expressions.ts:113-124`                         |
| `$node.<id>` com id inexistente lança `UnknownNodeIdError`; id não-executado → `undefined` legítimo                                                | `expressions.ts:39-45,91-93`                     |
| Resolução na thread principal, imediatamente antes do dispatch ao sandbox                                                                          | `engine.service.ts:868-907`                      |
| Campo `code` pulado por `if` de tipo na engine (não por marca no schema) — todo campo futuro de código livre precisará do mesmo tratamento manual  | `engine.service.ts:894-904`                      |
| Editor: **zero** autocomplete/preview; só hints estáticos de i18n e o `NodeIdBadge` de copiar id                                                   | `config-panel.tsx:1376-1401`                     |
| Contrato de regressão: 30 casos em `expressions.spec.ts`                                                                                           | `packages/nodes/src/expressions.spec.ts:1-199`   |
| `logic.code` como válvula: vê `$input` e `$vars` (com diff → `varsPatch`), **não vê `$node.*`**, sem rede/fs, retorno ≤1MB                         | `definitions/code.ts:97-115`                     |

### Falta construir

1. **Gramática com funções/operadores** (médio-alto). Restrições reais
   impostas pelo código atual:
   - a regex proíbe `}` no corpo — sintaxe com objeto literal exige scanner
     de verdade, e quanto mais parecer JS, mais falsos positivos em campos de
     texto livre (o problema do `code` muda de natureza mas não some);
   - raiz desconhecida hoje resolve para `undefined`/`""` **em silêncio** —
     grafos salvos podem depender disso; a gramática nova precisa ser
     superset estrito;
   - `WorkflowVersion` congela o grafo, **não o resolver** — todo grafo
     antigo roda com o resolver novo; não há `graph_version`;
   - a resolução roda na thread principal, fora do sandbox: funções built-in
     puras são seguras ali; nada Turing-completo pode entrar;
   - `preserveRoots` decide pela raiz até o primeiro ponto
     (`expressions.ts:67-75`) — sintaxe composta envolvendo `$auth` quebra a
     detecção de segunda passada do HTTP.
2. **`ExpressionInput` com autocomplete no editor** (médio). O editor tem o
   grafo em memória e o catálogo declara `outputs` nomeados, mas **não os
   shapes** — completar além do primeiro nível exige dado de execução real.
3. **Preview de valor** (médio). A matéria-prima existe (`ExecutionStep.
input/output` persistidos; SSE já carrega output no `step.completed`);
   falta endpoint "outputs por nodeId da última execução" + pin no painel.
4. **ADR** (baixo). `expressions.ts:2` diz "ver ADR-004", mas o ADR-004 não
   menciona expressões — a decisão "sem eval" não tem registro formal. Uma
   mudança de gramática merece o ADR que a decisão original não teve.

### Referência de mercado

n8n: expressões JS reais em sandbox + biblioteca built-in — e precisou de
autocomplete/preview com dado de execução para ser usável. Zapier: zero
sintaxe, transformação é step dedicado (Formatter). Make: funções inline
montadas por picker visual. O padrão comum: quem tem expressão computável
investiu pesado em UI assistida. Este repo está atrás das três referências
nas **duas** dimensões (gramática e UI).

---

## 3. Triggers de polling

### Veredicto

Hipótese confirmada com uma nuance: não existe cursor por trigger, mas o repo
tem o molde exato — `Conversation.state` (JSON por entidade, semeado na
execução, regravado no sucesso) + `AgentMemory` (unique composto). O esqueleto
cron cobre ~60% do caminho; o trabalho real é o processor de fetch/diff e as
decisões de produto.

### Já existe

| Item                                                                                                                                                | Evidência                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Node cron passthrough (`execute: (ctx) => ({ output: ctx.input })`) — o polling trigger seria igualmente declarativo                                | `packages/nodes/src/definitions/cron-trigger.ts:24`          |
| `syncWorkflowSchedule` idempotente com gate de status (2026-08-03) — bastaria procurar também `trigger.polling.*` e chavear por `workflowId:nodeId` | `apps/api/src/scheduler/scheduler.service.ts:41-73`          |
| `ScheduleProcessor` com defesa contra órfão e corrida — o processor de polling é este + fetch/diff antes do `trigger()`                             | `apps/api/src/scheduler/schedule.processor.ts:56-122`        |
| Molde do cursor: `Conversation.state` (ciclo ler→executar→regravar)                                                                                 | `schema.prisma:709-710`; `engine.service.ts:264-278,749-756` |
| Molde da chave: `AgentMemory @@unique([agentId, key])`                                                                                              | `schema.prisma:494-505`                                      |
| Molde do claim contra tick duplicado: `updateMany` condicional da engine                                                                            | `engine.service.ts:211-220`                                  |
| Precedente "1 execução por item": chat dispara 1 execução por mensagem                                                                              | `apps/api/src/chat/chat.service.ts:95-127`                   |
| `Variable` **não serve**: sem dimensão workflow/node, e o scope `runtime` é decorativo — a engine nunca lê `prisma.variable`                        | `variables.service.ts:36-72`                                 |

### Falta construir

1. Model `TriggerCursor` (`@@unique([workflowId, nodeId])`, `cursor Json`).
   **Pequeno.**
2. Valor novo no enum `TriggerType` — não repetir o precedente ruim do invoke
   por API gravando `webhook` (`executions.service.ts:116`). **Pequeno.**
3. Generalizar o sync para nodes de polling + limpar cursor órfão quando o
   node sai do grafo. **Médio.**
4. **O grosso**: processor de tick — gate de status → lê cursor → fetch (no
   worker, **fora do sandbox**: a execução ainda não nasceu) → diff → tick
   vazio não cria `Execution` → senão N × `trigger()` + avança cursor com
   claim condicional. **Médio-grande.**
5. Nodes de polling dado o catálogo: **Google Drive é o único read-SaaS
   pronto** ("arquivo novo na pasta" é quase grátis); Sheets reusa a mesma
   auth; HTTP genérico com cursor cobre a cauda longa; **"email novo" exige
   dependência nova** (não há nenhum node de leitura de email — `email-send`
   é SMTP puro). **Médio por node**, com a checklist de UI de sempre.
6. Painel: intervalo, "último item visto", reset de cursor. **Médio.**

### Decisões de produto em aberto

- **N itens novos → N execuções ou 1 com array?** O precedente do chat é
  1-por-item (mantém retry/replay/error-workflow por item), mas 50 linhas
  novas numa planilha = 50 execuções.
- **Primeiro tick**: dispara o backlog inteiro ou "começa de agora"? Mercado
  faz "de agora" (semeia o cursor sem disparar).
- **Cursor × versionamento**: persiste por `workflowId+nodeId` (id estável
  entre saves), reseta se o node for apagado; rollback para versão sem o node
  é ambíguo.
- **Durabilidade**: o agendamento vive só no Redis (P4.1 da
  [spec de pendências](spec-pendencias-2026-08.md)) — o polling herda a
  fragilidade; vale acoplar a solução.

---

## 4. Composição e dados

Respostas definitivas às três dúvidas deixadas em aberto:

### (A) Iteração por item — NÃO existe

- A engine roteia **um valor por edge, nunca N** (`engine.service.ts:565-611`)
  e um node executa **no máximo uma vez** por execução (set `executed`,
  `engine.service.ts:431-436`); ciclos não iteram.
- Array de 100 itens → `ai.chat` = **1 chamada** com o array inteiro
  serializado (`ai-chat.ts:8`).
- `logic.parallel` é fan-out estático de 3 branches com o **mesmo** input
  (`parallel.ts:21`); `transformList` só projeta campos dentro de um node;
  `merge` é join, não split.
- A válvula `logic.code` não serve para "chamar API por item": **sem `fetch`**
  (`code.ts:97-108`, "sem rede" em `code.meta.ts:31`).

**Custo de construir: alto — o mais caro do documento.** Exige frontier por
item, N steps por node, agregação, política de erro por item (falhou 1 de
100 → ?), e o estado de pausa serializado (teto de 1MB,
`engine.service.ts:141`) não comporta frontier multiplicado. Alternativa
tática: sub-workflow como corpo do loop (o pai fatia com `transformList`, a
filha processa o lote).

### (B) Binário entre nodes — NÃO trafega; a convenção é URL + texto

- Os parsers `file.*` **recebem URL e baixam eles mesmos**
  (`pdf-parse.ts:8-21`); o que cruza para o próximo node é o texto extraído.
- **O node HTTP corrompe download binário**: resposta não-JSON passa por
  `response.text()` (decodificação UTF-8 destrutiva,
  `http-request.ts:135-138`); upload é sempre `JSON.stringify` — sem
  multipart, sem body binário (`http-request.ts:91`). Um fluxo
  "baixa → transforma → sobe" **não é construível hoje**.
- Webhook só aceita JSON de **~100KB** (default do Express; `main.ts` não
  configura body-parser).
- **Não existe blob store** (nenhum S3/disco/bytea no schema); o upload da
  knowledge base (20MB, único multipart do sistema) guarda só o `rawText` —
  o arquivo original é descartado. Nodes de visão/OCR só aceitam `imageUrl`.
- Base64 em JSON é possível mas ninguém produz/consome, e cada step grava
  input **e** output como Json — blob grande é gravado 2× por tentativa, e
  execução com base64 grande no frontier fica **impausável** (teto de 1MB do
  `ExecutionPausedState`).

**Custo: caro por ausência total de fundação.** Exigiria blob store +
convenção de referência (`{blobId, mime, size}`) atravessando nodes.

### (C) Paginação de API — NÃO existe

- O node HTTP faz exatamente **um** `fetch` (`http-request.ts:128-154`); sem
  follow de `Link`, sem cursor, sem loop. GraphQL idem.
- Não dá para montar o loop no grafo (ciclos não iteram) nem no `code` (sem
  fetch). Paginação hoje = N nodes HTTP desenhados à mão.

**Custo: o mais barato do documento** — um loop de cursor dentro do próprio
`execute` do node HTTP (config `paginate: auto`), respeitando os 30s do
sandbox.

### Sub-workflows — o melhor custo-benefício

O esqueleto está quase todo pronto:

| Peça                                                                                                        | Evidência                                                        |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Disparar outro workflow com payload + `parentExecutionId` + anti-recursão binária (`event` nunca redispara) | `error-workflow.service.ts:36-93`, `:58`                         |
| Pausa durável **genérica** (`SuspendDescriptor` com `ref` opaca) + persist/restore do frontier              | `packages/nodes/src/types.ts:77-84`; `engine.service.ts:326-386` |
| Retomada enfileirada (`enqueueResume`) — hoje só aprovações usam                                            | `executions.service.ts:176`                                      |
| Espera por status terminal via `EXECUTION_PHASE` (Flow API)                                                 | `flow-api/execution-waiter.ts:80-114`                            |

Falta: o node `workflow.call` (a espera síncrona dentro do `execute` **não
serve** — 30s de timeout; o desenho certo é suspender com `ref` = id da
filha), o hook "filha terminou → `enqueueResume` no pai" (simétrico ao
`dispatchForFailedExecution`, `engine.service.ts:820`), uma capacidade RPC
nova no sandbox (custo conhecido: 5 arquivos em 3 camadas,
`03-nodes-catalogo.md:223`), contador de profundidade e detecção A→B→A, e a
decisão sobre reutilizar o status `waiting_approval` ou criar um novo (retry
e replay devolvem 409 nesse status hoje). **Esforço total: médio.**

---

## Hipóteses da conversa: confirmadas vs. corrigidas

| Hipótese (da conversa que motivou o discovery)    | Veredicto                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| OAuth é infraestrutura pesada, não "mais um node" | Confirmada — mas mais barata que o esperado: o contrato opaco do `getCredential` poupa os ~15 nodes           |
| Expressões: só travessia, sem computação          | Confirmada — com a nuance das `extraRoots` (`$auth`/`$sig`) e do `transformList`                              |
| "O node de código cobre o gap das expressões"     | **Corrigida**: não vê `$node.*` e não tem rede — cobre transformação de dado, não integração                  |
| Não existe for-each com controle de lote          | Confirmada — e é o item mais caro; a engine executa cada node no máximo 1 vez                                 |
| Binário entre nodes: dúvida                       | **Respondida**: não trafega; HTTP corrompe binário; sem blob store; "baixa→transforma→sobe" não é construível |
| Paginação: dúvida                                 | **Respondida**: não existe nada; é o item mais barato                                                         |
| Cursor por trigger não existe                     | Confirmada — mas `Conversation.state` é o molde pronto                                                        |

## Bugs e surpresas encontrados de passagem

- **`Variable.scope = runtime` é decorativo**: a engine nunca lê
  `prisma.variable` — o `$vars` nasce vazio ou do estado do chat
  (`variables.service.ts:36-72`). O CRUD existe, o consumo não.
- **`expressions.ts:2` cita ADR-004, que não fala de expressões** — a decisão
  "sem eval" não tem ADR.
- **O decrypt de credencial está copiado em 5 lugares** (engine, agents,
  autocomplete, debugger, knowledge) — pré-requisito de OAuth e dívida por si.
- **O Google Drive troca token dentro do sandbox** — desenho a não copiar
  para OAuth de usuário (funciona só porque Service Account não tem secret de
  plataforma).
- **Webhook `/hooks/:id` limitado a ~100KB** de JSON por default do Express
  não configurado (`main.ts:12-46`) — nunca documentado.

## Ordem sugerida

Critério: alavancagem por esforço, e dependências entre os temas.

1. **OAuth** (tamanho H2 médio) — destrava a categoria de integrações; nada
   mais neste documento compete em alavancagem. Começar pela consolidação do
   resolve de credencial (pré-requisito barato que já paga dívida).
2. **Sub-workflows** (médio) — a infra de pausa já paga o custo; e serve de
   válvula tática para iteração (fatiar no pai, processar na filha).
3. **Paginação no node HTTP** (pequeno) — resolve dor real de imediato,
   independe de tudo.
4. **Polling triggers** (médio-grande) — depende de OAuth para as fontes que
   importam (Sheets, Gmail); sem OAuth, só Drive/HTTP genérico. Fazer depois.
5. **Expressões: gramática mínima + preview** (médio) — funções puras
   (string/data/número) + preview com dado da última execução; o autocomplete
   completo fica para quando houver shapes de output.
6. **Iteração por item** (alto) — só depois de sub-workflows provarem que a
   válvula tática não basta; é a mudança mais invasiva na engine.
7. **Binário** (alto) — exige blob store; adiar até haver demanda concreta.
