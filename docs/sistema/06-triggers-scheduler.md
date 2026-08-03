# Triggers e scheduler

> Última revisão: 2026-08-03 · commit `93468bf`

## O que faz

Toda execução de fluxo nasce do mesmo jeito: alguém cria uma linha em `Execution` e enfileira um job na fila `executions` do BullMQ. O que muda entre um webhook, um agendamento e um clique no editor é só a **porta de entrada** — quem autentica, qual gate de status se aplica e que payload entra. Deste ponto em diante o caminho é idêntico, e é da [Engine de execução](01-engine-execucao.md) em diante.

Vale separar dois conceitos que o vocabulário do projeto mistura. O **node de trigger** é declarativo: mora no grafo, define que aquele fluxo tem uma porta e guarda a configuração dela (a expressão cron, a mensagem de boas-vindas do chat). Ele não escuta nada — o node em si é um passthrough puro, que só devolve o input recebido. O **caminho de entrada** é o código de verdade: um controller público, um processador de fila, um guard de chave de API. Salvar o grafo é o momento em que os dois se reconciliam: é aí que o `webhookId`/`chatToken`/`inboxToken` do node são copiados para colunas indexadas do `Workflow` (lookup O(1) no request público) e que o agendamento cron é (re)sincronizado no Redis — criado de fato só se o fluxo já estiver `active`, como detalhado adiante.

Como o node de trigger é passthrough, o `$json` inicial de qualquer fluxo é literalmente o `inputPayload` que a porta de entrada gravou na `Execution` — o corpo do POST no webhook, o objeto vazio no cron, o payload montado pelo ChatService no chat, o payload de erro no error workflow. Não há transformação implícita nenhuma. A engine escolhe o node de partida procurando o **primeiro** node de categoria `trigger` no grafo (`apps/api/src/engine/engine.service.ts:262`); um grafo com dois triggers não é rejeitado, apenas ignora o segundo. Um grafo sem nenhum trigger falha a execução na largada.

A versão executada também é decidida na porta de entrada, não na engine: toda entrada fixa a `currentVersionId` do fluxo no momento do enfileiramento (ver [Workflows e versionamento](02-workflows-versionamento.md)). Se o fluxo nunca teve um grafo salvo, o disparo é rejeitado com 400 em vez de criar uma execução impossível.

O gate de status é **diferente por porta**, de propósito, e isso é a regra mais fácil de errar. O disparo manual pelo editor ignora o status por completo — é assim que se testa um rascunho. Webhook e chat bloqueiam apenas `archived` (arquivar é o "desligar" na UI de fluxos), então um `draft` continua disparando pelo hook. A API pública por chave e o cron são os mais estritos: exigem `active`. Na API pública o gate é uma rejeição explícita no request (409), porque quem tem a chave está em produção, não testando. No cron o gate é de outra natureza — não há request para rejeitar, então ele é aplicado **na criação do agendamento**: enquanto o fluxo não estiver `active`, o repeatable job simplesmente não existe (`scheduler.service.ts:46`).

A escolha de gatear na criação, e não no consumo, é o que mantém "rascunho não roda sozinho" verdadeiro sem esconder estado. O agendamento é o único caso em que o estado vive fora do Postgres, e não há tela nem endpoint que liste os jobs — gatear no `ScheduleProcessor` deixaria jobs de rascunho tiquetaqueando para sempre, batendo no banco a cada tick e não disparando, sem nada visível explicando o porquê. Com o gate no sync, vale o invariante **existe repeatable job ⟹ fluxo `active` com `trigger.cron` habilitado**, e o estado do Redis é sempre derivável do Postgres. A volta não vale como equivalência: um fluxo `active` com cron habilitado cuja expressão não parseia fica sem job nenhum (`scheduler.service.ts:57`), e perder o Redis também deixa fluxos `active` sem agendamento — a implicação forte é só na direção "job existe ⟹ fluxo está ativo". O corolário prático para quem usa: **ativar é o que liga o cron** — salvar o grafo de um rascunho com cron habilitado não agenda nada, e o painel do node no editor diz isso.

O agendamento em si: não há tabela de schedules — a expressão cron é lida do config do node e materializada como um _repeatable job_ na fila `schedules`. O re-sync roda a cada save de grafo, a cada rollback de versão e a cada `PATCH` de status, sempre removendo antes de decidir se recria. Isso torna a operação idempotente e faz todos os "desligar" caírem no mesmo caminho: apagar o node cron, desmarcar `enabled`, voltar para rascunho ou arquivar. Quando o job dispara, o processador chama exatamente o mesmo caminho do disparo manual, só que carimbando `triggerType: 'cron'` e com payload vazio.

O `ScheduleProcessor` ainda confere o status antes de disparar (`schedule.processor.ts:60`), mas como **rede de segurança**, não como gate primário: agendamento no Redis e status no Postgres podem divergir (job criado por uma versão antiga do código, restore de backup, `UPDATE` direto no banco). Quando divergem, o job órfão se auto-remove em vez de disparar — é por isso que fluxos que ficaram agendados como rascunho param sozinhos no primeiro tick, sem script de migração. A remoção só acontece com a resposta do banco em mãos: se a consulta falhar, a exceção sobe e o job é retentado normalmente.

Essa auto-remoção tem uma corrida contra a ativação, e ela é fechada relendo o status **depois** de remover (`schedule.processor.ts:91`). O caso: um tick de um fluxo recém-despromovido ainda está na fila, o worker lê `draft`, e nesse instante um `PATCH status: 'active'` remove e recria o repeatable job — a remoção do worker, decidida com um status já velho, apagaria o job recém-nascido e deixaria um fluxo `active` com cron habilitado e nenhum agendamento, sem nada para reconstruí-lo até o próximo save/rollback/`PATCH`. Com a releitura, quem remove por último é também quem confere o estado final: se o fluxo voltou a `active`, o processador loga em nível `error` e re-sincroniza a partir do grafo da versão corrente. Como `syncWorkflowSchedule` remove antes de agendar, re-sincronizar é idempotente mesmo quando o `PATCH` já recriou o job. O tick em si não dispara execução — o status que ele leu era `draft`.

Por fim, o enum `TriggerType` do Prisma é fechado e tem cinco valores: `manual`, `webhook`, `cron`, `event` e `chat`. `event` é o carimbo do error workflow, e não é decorativo — é justamente ele que impede recursão infinita, já que uma execução `event` nunca dispara outro error workflow.

## Onde vive

| Arquivo                                             | Papel                                                                                                                                                                        |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/executions/executions.service.ts`     | Todas as portas de entrada convergem aqui; `createAndEnqueue` é o ponto único que cria a `Execution` e enfileira o job.                                                      |
| `apps/api/src/hooks/hooks.controller.ts`            | Controller público do webhook — uma rota só, sem auth, resolve o fluxo pelo `webhookId`.                                                                                     |
| `apps/api/src/scheduler/scheduler.service.ts`       | Cria/remove o repeatable job a partir do node `trigger.cron`; é onde mora o gate de `active`, a validação da expressão com `cron-parser` e o preview das próximas execuções. |
| `apps/api/src/scheduler/schedule.processor.ts`      | Consumidor da fila `schedules`: cada tick confere o status do fluxo e vira um disparo com `triggerType: 'cron'` — ou remove o agendamento órfão.                             |
| `apps/api/src/scheduler/scheduler.controller.ts`    | Endpoint autenticado de preview do cron, usado pelo painel do node no editor.                                                                                                |
| `apps/api/src/workflows/workflows.service.ts`       | `ensureWebhookId`/`ensureChatTokens` + a chamada de `syncWorkflowSchedule` no save do grafo, no rollback e no `PATCH` de status.                                             |
| `apps/api/src/executions/error-workflow.service.ts` | Porta de entrada do error workflow: monta o payload da execução que falhou e dispara o fluxo tratador.                                                                       |
| `apps/api/src/flow-api/flow-api.controller.ts`      | Porta de entrada autenticada por chave de API. Ver [Flow API pública](05-flow-api-publica.md).                                                                               |
| `packages/nodes/src/definitions/manual-trigger.ts`  | Node `trigger.manual`.                                                                                                                                                       |
| `packages/nodes/src/definitions/webhook-trigger.ts` | Node `trigger.webhook` (config guarda o `webhookId` gerado no save).                                                                                                         |
| `packages/nodes/src/definitions/cron-trigger.ts`    | Node `trigger.cron` (expressão, timezone, `enabled`).                                                                                                                        |
| `packages/nodes/src/definitions/chat-trigger.ts`    | Node `trigger.chat` (tokens de chat/inbox, mensagens de boas-vindas e de erro).                                                                                              |
| `packages/nodes/src/definitions/error-trigger.ts`   | Node `trigger.error`, entrada do fluxo tratador de erros.                                                                                                                    |
| `apps/web/src/components/editor/config-panel.tsx`   | Painéis dos triggers no editor: monta as URLs públicas e chama o preview do cron.                                                                                            |

**Rotas da API**

| Rota                                                      | O que faz                                                                                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /hooks/:webhookId`                                  | Público, sem autenticação. A própria URL é a credencial. Bloqueia só fluxo arquivado.                                                 |
| `POST /workflows/:id/run`                                 | Disparo manual pelo editor, autenticado por sessão + workspace. Ignora o status do fluxo.                                             |
| `POST /scheduler/preview`                                 | Devolve as próximas execuções de uma expressão cron; não agenda nada.                                                                 |
| `PUT /workflows/:id/graph`                                | Não é um trigger, mas é onde o re-sync do cron e dos tokens acontece.                                                                 |
| `PATCH /workflows/:id`                                    | Também não é um trigger, mas é o liga/desliga do cron: `active` agenda a partir do grafo da versão atual, `draft`/`archived` removem. |
| `POST /v1/flows/:workflowId/invoke`                       | Entrada por chave de API. Detalhada em [Flow API pública](05-flow-api-publica.md).                                                    |
| `POST /public/chat/:chatToken/conversations/:id/messages` | Cada mensagem do visitante dispara uma execução. Ver [Chat e inbox](07-chat-inbox.md).                                                |

**Models Prisma**

- `Workflow` — carrega as três colunas de porta de entrada: `webhookId`, `chatToken` e `inboxToken`, todas `@unique` e sincronizadas a partir do grafo. `errorWorkflowId` aponta o fluxo tratador.
- `Execution` — `triggerType`, `versionId` e `inputPayload` registram qual porta abriu, com qual versão e com que dado.

**Filas BullMQ**

- `executions` — a fila de execução propriamente dita; toda porta de entrada termina aqui.
- `schedules` — repeatable jobs dos triggers cron, um por fluxo, com a chave igual ao `workflowId`.

## Como se conecta

- Entrega tudo para a [Engine de execução](01-engine-execucao.md), que é quem sabe o que fazer com a `Execution` enfileirada.
- Depende de [Workflows e versionamento](02-workflows-versionamento.md): as portas só existem depois de um grafo salvo, é o save que fixa os tokens, e é o status do fluxo que decide se o agendamento existe.
- Os nodes de trigger fazem parte do [Catálogo de nodes](03-nodes-catalogo.md) como uma categoria própria.
- A porta por chave de API é documentada em [Flow API pública](05-flow-api-publica.md); a porta de chat, em [Chat e inbox](07-chat-inbox.md).
- O `trigger.error` é a ponta de entrada do error workflow, cujo comportamento (payload, anti-recursão, fire-and-forget) é da [Engine de execução](01-engine-execucao.md).
- Depende de [Auth e workspaces](12-auth-workspaces.md) nas portas autenticadas — as públicas escapam do guard global via decorator `@Public()`.

## Decisões e histórico

- [ADR-008](../adr/008-worker-separado.md) — por que o disparo só enfileira e nunca executa em linha: quem executa é o worker separado.
- [ADR-006](../adr/006-multi-tenancy.md) — por que as portas autenticadas passam por `WorkspaceGuard` e as públicas resolvem o fluxo por um token único e opaco.
- [SPEC H2-04](../produto/spec-h2-04-publicar-como-api.md) — a porta por chave de API e por que ela é mais estrita que o webhook.
- [SPEC H2-05](../produto/spec-h2-05-continue-on-error-error-workflow.md) — o error workflow como porta de entrada e o carimbo `event` como guarda anti-recursão.
- [SPEC H2-01](../produto/spec-h2-01-correcoes-passagem.md) — origem do gate de `archived` no webhook e no chat (antes disso, arquivar um fluxo não parava o hook, que seguia criando execuções e gastando tokens).
- Não há ADR do scheduler nem do formato de porta de entrada. A escolha de guardar o agendamento só como repeatable job do BullMQ, sem tabela espelho no Postgres, está registrada apenas em comentário no código.
- O gate de `active` no cron nasceu de uma incoerência: até então `saveGraph` agendava sem olhar o status, e um rascunho com cron habilitado passava a disparar execuções reais a partir do primeiro save — só o `PATCH` de status desagendava. A alternativa considerada foi gatear no `ScheduleProcessor` (agendar sempre, não disparar em rascunho); perdeu porque deixaria o Redis cheio de jobs que não fazem nada, num estado que nenhuma tela mostra. O gate ficou no sync e o processador guardou só a checagem defensiva. Sem ADR: a decisão está nos comentários de `scheduler.service.ts` e nos testes de `scheduler.service.spec.ts`.

## Limitações e fora de escopo

- **O agendamento só existe no Redis.** Perder o Redis perde todos os schedules, e nada os reconstrói automaticamente — só um novo save de cada grafo afetado, ou um `PATCH` de status. Não há tela nem endpoint que liste os jobs agendados. A auto-remoção do job órfão no processador conserta a divergência numa direção só (job a mais); job a menos continua invisível, com uma única exceção — a corrida da própria auto-remoção contra uma ativação concorrente, que o processador detecta relendo o status e re-sincroniza (`schedule.processor.ts:91`).
- **Um trigger por fluxo, na prática.** A engine pega o primeiro node de categoria `trigger` e ignora os demais; não há validação que rejeite um grafo com dois.
- **Cron inválido falha em silêncio no servidor.** `syncWorkflowSchedule` valida a expressão e, se ela não parsear, apenas loga um aviso e não agenda — o save do grafo continua com sucesso e o usuário não recebe nenhum erro; ativar depois um fluxo com expressão inválida também não avisa nada. O que _não_ é silencioso é a edição: o painel do node valida em tempo real pelo `POST /scheduler/preview` e mostra um `role="alert"` com "Expressao cron invalida" (coberto em `apps/e2e/tests/search-scheduler/scheduler.spec.ts:96`). Ou seja, quem digita a expressão vê o erro na hora; o que ninguém impede é salvar e ativar por cima do alerta.
- **`removeSchedule` casa por substring** da chave do repeatable job (`scheduler.service.ts:79`), não por igualdade. Funciona porque a chave é o `workflowId` (um UUID), mas é uma correspondência mais frouxa do que precisaria ser.
- **O invoke por chave de API grava `triggerType: 'webhook'`** (`executions.service.ts:116`), não um valor próprio — o enum é fechado e não tem `api`. Consequência: filtros e métricas por tipo de trigger não separam chamadas de webhook de chamadas da API publicada.
- **Sem retry, verificação de assinatura ou idempotência no webhook.** Não há validação de origem (HMAC, IP), não há chave de idempotência e um POST duplicado gera duas execuções.
- **Sem trigger por polling, e-mail, fila externa ou evento de banco.** As cinco portas descritas aqui são todas que existem.
- **Fluxo criado a partir de template não agenda o cron** — e agora isso deixou de ser um problema prático. `templates.service.ts` continua sem chamar `syncWorkflowSchedule` (cuida só dos tokens de webhook e chat, corrigido no H2-02), mas o fluxo nasce `draft` e, portanto, não deveria mesmo estar agendado; o `PATCH` de ativação sincroniza a partir do grafo da versão atual, então não é mais preciso salvar o grafo no editor antes de ativar.
- **Não há aviso de "cron habilitado num fluxo que não está ativo".** O painel do node no editor traz uma frase explicando a regra, mas nada destaca o caso concreto de um rascunho com cron habilitado esperando ativação — nem no editor, nem na lista de fluxos.
