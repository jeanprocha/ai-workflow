# Pausa durável e aprovação humana

> Última revisão: 2026-08-02 · commit `80da213`

## O que faz

Um fluxo precisa parar no meio da execução, esperar horas ou dias por uma decisão
humana, e retomar exatamente de onde parou. O mecanismo que sustenta isso é a
**pausa durável**, e ele é deliberadamente genérico: a engine não sabe o que é uma
aprovação. Ela só sabe que um node pediu para suspender, e que um dia alguém vai
mandar retomar com um dado. Aprovação humana é, até aqui, o único usuário desse
mecanismo — mas o contrato foi desenhado para qualquer node que precise esperar
por um evento externo (uma resposta de webhook, um job de terceiro, um sinal de
outro sistema).

O contrato tem três peças. Um node que quer pausar devolve um **descritor de
suspensão** no resultado: um motivo (vira log e evento), uma referência opaca à
pendência no domínio do próprio node, e um rótulo curto para a UI. A engine nunca
interpreta o conteúdo — usa a referência só para reidentificar o node na
retomada. Quando a engine vê esse descritor, ela para de rotear a partir daquele
node, serializa **todo o estado vivo da execução** — saídas de cada node,
variáveis, quais nodes já rodaram, os buffers dos merges pendentes, os totais de
token e custo — numa linha de `ExecutionPausedState`, e move a execução para o
status `waiting_approval`. Na retomada, a engine restaura esse estado e roda **o
mesmo node de novo**, agora com um campo `resumeData` preenchido. A primeira
passada tem `resumeData` indefinido; é exatamente esse `undefined` que o node usa
para saber se deve suspender ou processar a decisão.

O comportamento na hora de pausar é "drenar e pausar": os irmãos do node suspenso
na mesma onda (por exemplo, o outro lado de um `parallel`) terminam normalmente
antes de a execução ser congelada. E como o estado só é persistido nesse momento,
uma execução pausada não é uma execução travada — a rede de segurança que mata
execuções órfãs exclui `waiting_approval` de propósito.

Sobre essa base, o node **`approval.human`** dá a semântica de aprovação. Na
primeira passada ele chama o RPC `requestApproval`, que a engine encaminha para o
serviço de aprovações: nasce uma linha `Approval` com título, prazo, ação de
timeout e um **token de 32 bytes guardado apenas como hash**, e volta a URL
pública de decisão. Quem envia o e-mail é o **node**, não a plataforma — decisão
de produto: nada depois dele roda até a decisão chegar, então quem pausou é quem
avisa, usando uma conexão SMTP do workspace, no mesmo molde do node de e-mail. Só
então o node devolve o descritor de suspensão. Na retomada, ele lê a decisão,
anexa aprovado/comentário/quem decidiu/quando ao output, e dispara o branch
`approved` ou `rejected`.

Decidir pode acontecer por dois caminhos. O **público** é a página que o link do
e-mail abre: sem conta, o token na URL é a única prova de posse. O `GET` só lê o
estado — nunca decide, para que um scanner de link de e-mail ou um preview não
aprove nada sozinho; a decisão é sempre um `POST`, com rate limit por IP. O
**autenticado** é a fila de aprovações do workspace, onde quem está logado vê as
pendências e decide identificado pelo próprio e-mail. Os dois caminhos convergem
no mesmo consumo atômico: um `updateMany` cujo `where` exige `decidedAt: null` e
o prazo dentro do limite. Quem perde a corrida recebe a mesma resposta para "já
foi decidida" e "expirou" — a distinção não ajudaria ninguém a agir diferente.

Duas coisas podem dar errado fora do fluxo normal, e ambas são resolvidas pelo
mesmo **sweeper** periódico. A primeira é o prazo estourar sem ninguém decidir:
o sweeper varre as vencidas e aplica a ação configurada (`approve` ou `reject`)
como decisão do sistema — e o guard de expiração aqui é o oposto do usado pelos
humanos, só aplicando se o prazo **já** venceu. A segunda é a retomada travar: a
decisão é gravada e o job de retomada enfileirado em dois passos, e se o processo
morrer entre eles a decisão fica válida mas nunca chega ao worker. O sweeper
detecta isso pela ausência do carimbo de enfileiramento, reenfileira, e depois de
cinco tentativas desiste e falha a execução explicitamente — melhor que deixá-la
presa para sempre com uma decisão humana já tomada que nunca vale.

Há ainda o caminho terminal: se a execução morre por qualquer outro motivo
(falha, cancelamento, recuperação de órfã) com uma aprovação em aberto, ela é
marcada como `void`. Sem isso, um link vivo continuaria na caixa de entrada de
alguém apontando para uma execução que já acabou.

## Onde vive

| Arquivo                                                        | Papel                                                                                               |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `packages/nodes/src/types.ts`                                  | `SuspendDescriptor`, `resumeData` e o RPC `requestApproval` no contexto de execução.                |
| `packages/nodes/src/definitions/approval-human.ts`             | O node: pede a aprovação, envia o e-mail, suspende; na retomada ramifica `approved`/`rejected`.     |
| `packages/nodes/src/definitions/approval-human.meta.ts`        | Schema do config (título, conexão SMTP, destinatários, prazo, ação de timeout).                     |
| `apps/api/src/engine/engine.service.ts`                        | Persiste/restaura o `PausedStateV1`, marca `waiting_approval`, emite `execution.suspended`.         |
| `apps/api/src/engine/sandbox/node-sandbox-runner.ts`           | Encaminha o RPC `requestApproval` do worker para o host.                                            |
| `apps/api/src/approvals/approvals.service.ts`                  | Criação (upsert que rotaciona o token), decisão atômica, timeout, void, enfileiramento da retomada. |
| `apps/api/src/approvals/approvals.controller.ts`               | Fila autenticada, escopada ao workspace.                                                            |
| `apps/api/src/approvals/approve-public.controller.ts`          | Rotas públicas por token — `GET` lê, `POST` decide.                                                 |
| `apps/api/src/approvals/approval-rate-limit.ts`                | Rate limit em memória por IP das rotas públicas.                                                    |
| `apps/api/src/approvals/approvals-sweep.processor.ts`          | As duas varreduras: expiradas e retomadas travadas.                                                 |
| `apps/api/src/approvals/approvals.module.ts`                   | Agenda o job repetível do sweeper (`APPROVAL_SWEEP_INTERVAL_MS`, 60s por padrão).                   |
| `apps/api/src/executions/executions.service.ts`                | `enqueueResume`; e o 409 que impede retry/replay de execução pausada.                               |
| `apps/api/src/workflows/graph.schema.ts`                       | Gate: bloqueia `approval.human` em fluxo com trigger de chat (v1).                                  |
| `apps/api/src/worker/orphan-recovery.service.ts`               | Anula aprovações abertas de execuções órfãs.                                                        |
| `apps/web/src/proxy.ts`                                        | `/approve` em `PUBLIC_ROUTES` mas fora de `AUTH_ROUTES` — ver abaixo.                               |
| `apps/web/src/components/approvals/approval-decision-view.tsx` | A tela de decisão pública.                                                                          |
| `apps/web/src/app/(app)/approvals/page.tsx`                    | A fila autenticada.                                                                                 |
| `apps/web/src/components/editor/config-panel.tsx`              | Painel do node `approval.human` no editor.                                                          |

**Rotas da API**

| Rota                                                         | O que faz                                                                           |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `GET /approvals`                                             | Fila do workspace (autenticada).                                                    |
| `POST /approvals/:id/approve` · `POST /approvals/:id/reject` | Decide identificado pelo e-mail do usuário.                                         |
| `GET /approve/:token`                                        | Estado público da pendência. Nunca decide.                                          |
| `POST /approve/:token/decide`                                | Decisão pública, sem conta. Resposta única para link inválido/já decidido/expirado. |

**Páginas web**

| Página             | O que faz                                             |
| ------------------ | ----------------------------------------------------- |
| `/approve/[token]` | Pública, sem sessão — abre o link do e-mail e decide. |
| `/approvals`       | Fila autenticada do workspace.                        |

Uma sutileza que já foi bug (`80da213`): `/approve` é rota pública, mas **não** é
rota de autenticação. Se estivesse no grupo de `/login` e afins, um usuário logado
que clicasse no link do e-mail seria redirecionado para o dashboard em vez de ver
a aprovação.

**Models Prisma**

- `Approval` — a pendência: execução e node de origem, workspace denormalizado,
  título, hash do token, prazo, ação de timeout, decisão/comentário/quem
  decidiu, e o par `resumeEnqueuedAt`/`resumeAttempts` que o sweeper usa. Única
  por `[executionId, nodeId]`.
- `ExecutionPausedState` — o estado congelado da execução, com um número de
  versão que faz o restore falhar explícito se o formato mudar entre deploys.
- Enums: `ApprovalDecisionValue` (`approved`/`rejected`/`void`) e
  `ApprovalTimeoutAction` (subconjunto deliberado, nunca `void`).
- `Execution` ganhou o status `waiting_approval`, mais `suspendedAt` e
  `elapsedMsBeforePause` — sem o segundo, uma execução parada por dias reportaria
  uma duração absurda.

**Filas BullMQ**

- `approvals` — job repetível do sweeper, concorrência 1.
- A retomada em si volta pela fila de execuções, com o job carregando o node e o
  dado da decisão.

## Como se conecta

- Depende inteiramente da [engine de execução](01-engine-execucao.md): é ela que
  interpreta o `suspend`, congela e restaura o frontier do grafo.
- O node `approval.human` é uma definição como qualquer outra —
  ver [Catálogo de nodes](03-nodes-catalogo.md) para a anatomia e o RPC.
- Usa uma conexão SMTP do workspace para enviar o link, então depende do cofre
  de credenciais de [auth e workspaces](12-auth-workspaces.md).
- O status `waiting_approval` é o que quebrou o modo síncrono da
  [flow API pública](05-flow-api-publica.md) — a correção foi derivar as fases de
  status de um único lugar.
- A UI aparece no [editor web](13-web-editor.md) (painel do node) e na tela de
  execuções; os eventos de suspensão passam pelo SSE de
  [observabilidade](14-observabilidade-deploy.md).
- Combinar com [chat/inbox](07-chat-inbox.md) é bloqueado na validação do grafo
  na v1.

## Decisões e histórico

- [ADR-011](../adr/011-pausa-duravel.md) — por que a pausa exigiu persistir o
  frontier inteiro, quais mecanismos anteriores (flush parcial do merge, rede de
  segurança de execuções travadas, recuperação de órfãs) precisaram ser
  reescritos, e por que o sweeper é um job repetível e não um job atrasado por
  aprovação.
- [SPEC H2-06](../produto/spec-h2-06-aprovacao-humana.md) — o recorte de produto:
  link público sem conta, quem envia o e-mail, ação de timeout, fila do
  workspace.
- [ADR-005](../adr/005-isolamento-execucao-nodes.md) — o isolamento em
  `worker_thread` com timeout duro é o motivo de "esperar dentro do node" nunca
  ter sido opção.
- Não há ADR específico para o **rate limit** das rotas públicas nem para o
  formato do token: as duas escolhas estão documentadas em comentário no
  `approve-public.controller.ts` e no `approvals.service.ts`.

## Limitações e fora de escopo

- **Aprovação em fluxo de chat é bloqueada na v1**, na validação do grafo.
- **Um aprovador é qualquer um com o link.** Não há aprovadores nomeados, quórum,
  múltiplas assinaturas, delegação nem escalonamento — a única identidade
  registrada é o e-mail de quem decidiu pela fila autenticada; pelo link público,
  fica nulo.
- **O link é único por node e rotativo.** Se o sandbox morrer depois do RPC e o
  node for retentado, o token é rotacionado: se o primeiro e-mail já tinha saído,
  aquele link para de valer.
- **O canal de aviso é só e-mail (SMTP).** Nada de Slack, WhatsApp ou push, e o
  envio depende de uma conexão SMTP configurada no workspace.
- **O estado pausado tem teto de 1 MB serializado.** Um fluxo grande, com muitas
  saídas acumuladas, falha ao pausar em vez de gravar um blob enorme em silêncio.
- **O formato do estado é versionado, mas não migrado.** Uma execução pausada
  antes de um deploy que mude o formato falha explicitamente na retomada.
- **Retry e replay de uma execução pausada são recusados** com 409.
- **A fila autenticada retorna no máximo 100 itens**, sem paginação nem filtro
  por status; o status "expirada" é derivado no cliente.
- **O sweeper roda com concorrência 1 e varre até 100 linhas por tipo por tick** —
  suficiente hoje, mas é um limite fixo, não uma vazão adaptativa.
- Não existe cancelar/reenviar uma aprovação pendente pela UI, nem reenviar o
  e-mail sem retentar o node.
