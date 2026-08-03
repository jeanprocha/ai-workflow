# Workflows, grafo e versionamento

> Última revisão: 2026-08-03 · commit `d12ca35`

## O que faz

Um workflow (ou "fluxo", como aparece na interface) é a unidade que o usuário cria, edita e publica. Ele pertence a um workspace, tem nome, descrição e um status, e o que ele de fato _é_ mora num **grafo**: um JSON com nodes, edges e viewport, no mesmo formato que o React Flow consome no editor (ADR-004). Cada node tem id, tipo, categoria, rótulo, posição na tela e um objeto de configuração livre; opcionalmente também uma política de retry e uma política de erro. Cada edge liga o id de um node de origem ao de um node de destino, podendo nomear o handle de saída — é assim que o If distingue "verdadeiro" de "falso", e é assim que o caminho de erro se distingue do caminho normal (existe um handle reservado para isso).

O grafo é **validado em duas camadas** ao ser salvo. A primeira é estrutural, um schema Zod que garante a forma dos nodes e das edges. A segunda é cruzada, e é onde moram as regras que não cabem no schema de nenhum node isolado: todo `type` de node precisa existir no catálogo, toda edge precisa apontar para ids que existem no próprio grafo, uma edge no handle de erro exige que o node de origem tenha o caminho de erro habilitado, e um node de aprovação humana é rejeitado em fluxos disparados por chat. Fora dessas duas camadas, a configuração específica de cada node (o `configSchema` que também gera o formulário do editor) **não** é validada no save — ela só é conferida na hora de executar, dentro do sandbox, quando as expressões `{{ }}` já foram resolvidas e os campos têm os tipos reais. Validar antes rejeitaria um `{{ $vars.timeout }}` legítimo num campo numérico.

O salvamento é **manual, sem autosave**. O editor marca o estado como "não salvo" a cada mexida e só faz o `PUT` quando o usuário aperta Salvar ou Ctrl+S. Duas abas abertas no mesmo fluxo não se coordenam: a última que salvar sobrescreve a outra, sem detecção de conflito.

Cada save cria uma **nova `WorkflowVersion`**: um snapshot imutável e numerado do grafo, com autor e data, e o workflow passa a apontar para ela. Versões nunca são editadas nem apagadas — o histórico é linear e append-only. É esse ponteiro para a versão corrente que os disparos usam: quando uma execução nasce, ela grava o `versionId` daquele instante e roda aquele snapshot até o fim, mesmo que alguém edite o fluxo enquanto ela executa. Rollback e "publicar uma versão antiga" são a mesma operação, e ela não move o ponteiro para trás: clona o grafo da versão alvo como uma versão nova no topo da numeração, do mesmo jeito que um `git revert` produz um commit novo em vez de reescrever a história. Comparar duas versões é um diff por id de node e de edge, calculado no cliente, que classifica cada node em adicionado, removido, alterado ou inalterado — mover um node de lugar na tela não conta como alteração, porque a posição fica de fora da comparação.

Salvar o grafo também tem **efeitos derivados**, e é importante saber que existem porque eles não são óbvios olhando só o CRUD. Se o grafo tiver um trigger de webhook, um identificador estável é gerado na primeira vez e sincronizado numa coluna do workflow, para que o endpoint público de hook resolva o fluxo em uma consulta. Se tiver um trigger de chat, dois tokens são gerados do mesmo jeito — um para o visitante da página pública e outro para o operador da inbox. E o agendamento cron é ressincronizado a cada save do grafo: o job repetível antigo é removido e, se o fluxo estiver `active` e o grafo tiver um trigger cron habilitado com expressão válida, um novo é registrado. Rollback faz exatamente as mesmas três coisas, já que também produz uma versão nova.

O ciclo de vida do fluxo tem três estados. `draft` é onde ele nasce: já dá para disparar manualmente pelo editor e já dá para chamar o webhook (é assim que se testa antes de ativar), mas a API pública recusa. `active` é o fluxo em produção: a API pública aceita invocações. `archived` é o "desligado": o webhook passa a responder como se não existisse, o cron é removido, a API pública recusa. O cron é a porta em que o status pesa mais: o agendamento só é criado enquanto o fluxo está `active`, então salvar o grafo de um rascunho com trigger cron habilitado não faz nada — **ativar é o que liga o cron**. Por isso o PATCH de status ressincroniza o agendamento em qualquer direção (`apps/api/src/workflows/workflows.service.ts:169`): ativar agenda a partir do grafo da versão corrente, voltar para rascunho ou arquivar remove. Apagar um workflow apaga em cascata suas versões, execuções, conversas e chaves de API, e remove o agendamento. Os detalhes de por que o gate mora na criação do agendamento e não no consumo estão em [Triggers e scheduler](06-triggers-scheduler.md).

Além disso, um workflow pode apontar para **outro workflow do mesmo workspace como tratador de erro**: uma auto-relação que a engine usa quando uma execução falha. Apontar para si mesmo é rejeitado, e apagar o tratador apenas limpa o ponteiro em vez de bloquear a operação.

## Onde vive

| Arquivo                                                     | Papel                                                                                                            |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/workflows/workflows.service.ts`               | CRUD, save do grafo (nova versão + sincronização de webhook/chat/cron), listagem e leitura de versões, rollback. |
| `apps/api/src/workflows/workflows.controller.ts`            | Rotas do domínio, todas atrás do guard de workspace.                                                             |
| `apps/api/src/workflows/graph.schema.ts`                    | Schema Zod do grafo e a validação cruzada (catálogo, edges órfãs, handle de erro, aprovação em fluxo de chat).   |
| `apps/api/src/workflows/dto/`                               | DTOs de criação, atualização, save de grafo e disparo manual.                                                    |
| `packages/shared/src/graph.ts`                              | Tipos do grafo (node, edge, viewport), o handle reservado de erro e o type do node de aprovação.                 |
| `packages/shared/src/workflow.ts`                           | Tipos de `Workflow` e `WorkflowVersion` compartilhados entre API e web.                                          |
| `packages/shared/src/graph-diff.ts`                         | Diff entre dois grafos, por id; posição do node fica de fora da comparação.                                      |
| `apps/web/src/components/editor/flow-editor.tsx`            | O canvas React Flow e o estado "não salvo"/"salvando"/"salvo" do save manual.                                    |
| `apps/web/src/components/editor/version-history-dialog.tsx` | Histórico de versões e o diff visual entre a versão corrente e uma anterior.                                     |
| `apps/api/src/scheduler/scheduler.service.ts`               | `syncWorkflowSchedule`/`removeSchedule`, chamados a cada save, rollback, PATCH de status e delete.               |

**Rotas da API**

| Rota                                               | O que faz                                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `GET /workflows`                                   | Lista os fluxos do workspace, mais recentes primeiro.                                                   |
| `POST /workflows`                                  | Cria o fluxo já com a versão 1 (grafo vazio) e aponta para ela.                                         |
| `GET /workflows/:id`                               | Detalhe do fluxo com a versão corrente embutida.                                                        |
| `PATCH /workflows/:id`                             | Atualiza nome, descrição, status e tratador de erro; sincroniza o cron conforme o novo status.          |
| `DELETE /workflows/:id`                            | Apaga o fluxo (cascata) e remove o agendamento.                                                         |
| `PUT /workflows/:id/graph`                         | Valida o grafo, cria uma nova versão, sincroniza webhookId/chatToken/inboxToken e ressincroniza o cron. |
| `POST /workflows/:id/run`                          | Dispara uma execução manual da versão corrente.                                                         |
| `GET /workflows/:id/versions`                      | Lista as versões (número, data, autor, qual é a corrente).                                              |
| `GET /workflows/:id/versions/:versionId`           | Traz o grafo completo de uma versão.                                                                    |
| `POST /workflows/:id/versions/:versionId/rollback` | Clona o grafo da versão alvo como uma versão nova e aponta para ela.                                    |

**Páginas web**

| Página        | O que faz                                                                       |
| ------------- | ------------------------------------------------------------------------------- |
| `/flows`      | Lista de fluxos do workspace.                                                   |
| `/flows/[id]` | Editor visual: canvas, paleta, painel de config, toolbar, histórico de versões. |

**Models Prisma**

| Model             | Papel                                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Workflow`        | O fluxo: workspace, nome, descrição, status, ponteiro para a versão corrente, `webhookId`/`chatToken`/`inboxToken` derivados do grafo e a auto-relação `errorWorkflowId`. |
| `WorkflowVersion` | Snapshot imutável do grafo, numerado por fluxo (`workflowId` + `versionNumber` é único), com autor e data.                                                                |
| `WorkflowApiKey`  | Chave de API por fluxo para a API pública — detalhada em [Flow API pública](05-flow-api-publica.md).                                                                      |

## Como se conecta

- É a fonte do que a [Engine de execução](01-engine-execucao.md) roda: toda execução fixa um `versionId` e executa aquele snapshot.
- Depende do catálogo de [Nodes](03-nodes-catalogo.md) para validar tipos no save e para o editor montar formulários.
- Os identificadores derivados do grafo alimentam [Triggers e scheduler](06-triggers-scheduler.md) (webhook e cron) e [Chat e inbox](07-chat-inbox.md) (tokens do visitante e do operador).
- O status do fluxo é o gate da [Flow API pública](05-flow-api-publica.md), que só aceita fluxos `active`.
- A regra que bloqueia aprovação humana em fluxo de chat vem de [Aprovação humana](04-aprovacao-humana.md), mas é aplicada aqui, na validação do grafo.
- O consumo pelo usuário acontece no [Editor web](13-web-editor.md); o isolamento por workspace vem de [Auth e workspaces](12-auth-workspaces.md).
- A [Plataforma de IA](11-ai-plataforma.md) (autocomplete, copilot) gera grafos que passam pela mesma validação cruzada — foi para isso que ela foi criada.

## Decisões e histórico

- [ADR-004](../adr/004-formato-grafo.md) — por que o grafo é um JSON próprio compatível 1:1 com o React Flow, em vez de uma DSL textual ou um formato de terceiros. Registra também que versionar o _formato_ do grafo (`graph_version`) fica para quando for necessário; isso não existe hoje.
- [ADR-006](../adr/006-multi-tenancy.md) — o escopo por workspace que todas as rotas deste domínio aplicam.
- [spec-h2-05](../produto/spec-h2-05-continue-on-error-error-workflow.md) — a auto-relação de fluxo tratador de erro e a política de erro por node.
- [spec-h2-02](../produto/spec-h2-02-templates-crud.md) — templates, que são outra origem de grafo válido além do editor.
- **A decisão de salvar manualmente (sem autosave) não tem ADR.** O repo registra essa lacuna explicitamente em [base-evolucao](../produto/base-evolucao.md) (§3.3, junto com a ausência de ADR do chat público); o motivo só existe como comentário em `apps/web/src/components/editor/flow-editor.tsx:140`.
- Também não há ADR para o modelo de versionamento em si (snapshot imutável a cada save, rollback como versão nova) — a justificativa está apenas no comentário de `WorkflowsService.rollback`.

## Limitações e fora de escopo

- **Sem detecção de conflito no save.** Duas abas ou dois usuários editando o mesmo fluxo sobrescrevem um ao outro em silêncio; a versão perdida continua no histórico, mas ninguém é avisado.
- **Sem autosave e sem rascunho local.** Fechar a aba com alterações não salvas perde o trabalho — não há recuperação.
- **Versões nunca são podadas.** Cada save gera uma linha nova com o grafo inteiro; não há retenção, compactação nem delete de versões antigas.
- **O diff é calculado no cliente e é raso.** Um node "alterado" é sinalizado comparando o `config` inteiro serializado — não há diff campo a campo, e não há diff no lado da API.
- **A config de cada node não é validada no save.** Um campo obrigatório vazio ou um tipo errado só aparece quando o node roda; a validação do save cobre a forma do grafo e a existência do tipo, não o conteúdo da configuração.
- **Um trigger de cada tipo por grafo, na prática.** A sincronização de webhook, tokens de chat e cron sempre procura o _primeiro_ node daquele tipo; um segundo trigger do mesmo tipo é ignorado silenciosamente.
- **Rollback não é reversível para o estado exato.** Ele clona o grafo, mas os identificadores derivados (webhook, tokens de chat) são preservados a partir do grafo alvo, e o agendamento é ressincronizado — não há um "desfazer" que restaure o ponteiro anterior.
- **O gate de status continua diferente por porta.** `draft` bloqueia a API pública e o cron, `archived` bloqueia também o webhook e o chat, e o disparo manual pelo editor não olha status nenhum. É deliberado (cada porta tem um usuário diferente), mas não há um lugar só onde a regra esteja declarada — ver [Triggers e scheduler](06-triggers-scheduler.md).
- **Não há validação semântica do fluxo.** Um grafo sem trigger, com nodes desconectados, ou com um merge que nunca receberá todas as entradas passa no save; o problema só aparece na execução.
