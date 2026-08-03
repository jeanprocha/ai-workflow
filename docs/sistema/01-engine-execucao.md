# Engine de execução

> Última revisão: 2026-08-03 · commit `93468bf`

## O que faz

A engine é a peça que transforma um grafo salvo em uma execução real. Ela recebe o id de uma `Execution` já criada no banco, carrega o snapshot do grafo daquela versão e percorre o grafo executando cada node, gravando o que aconteceu passo a passo. Ela não roda no processo da API: vive no processo do worker, que consome as filas do BullMQ e precisa ser iniciado separadamente (ADR-008). Quem sobe só `pnpm dev` da API tem um sistema que aceita disparos e nunca executa nada — as execuções ficam `queued` para sempre.

O percurso do grafo é feito por **ondas**. Uma onda é um conjunto de nodes prontos para rodar ao mesmo tempo; todos os nodes de uma onda executam concorrentemente e a onda seguinte só começa quando a anterior inteira terminou. É isso que dá paralelismo real a um fan-out (o node Parallel, um If que dispara duas saídas, qualquer node com várias edges de saída). O caso especial é o node de junção: um `logic.merge` acumula os outputs que chegam em um buffer e só entra numa onda quando todas as suas edges de entrada tiverem chegado, recebendo o array acumulado como input. Existe uma válvula de escape para quando o resto do grafo esvazia com um merge ainda parcialmente preenchido (um If que só roteou um lado, por exemplo): a engine executa o merge com o que chegou e registra um aviso, em vez de terminar a execução em silêncio deixando metade do fluxo por rodar.

Cada node roda **isolado num worker_thread próprio** (ADR-005). Não é uma race de Promise: o timeout mata a thread de verdade, e há limite de heap configurado no próprio worker. O ambiente é montado por allowlist — a thread recebe só um punhado de variáveis de ambiente, nunca o `process.env` inteiro, para que código de dentro do node não alcance a chave de criptografia de segredos nem a string de conexão do banco. Como o node às vezes precisa de coisas que só existem no processo principal (ler uma credencial descriptografada, chamar um agente, buscar na base de conhecimento, invocar uma tool MCP, criar uma pendência de aprovação), essas chamadas atravessam a fronteira da thread por RPC via `postMessage` e são atendidas no thread principal. O `configSchema` de cada node é validado dentro da thread, com a config já resolvida — não no momento de salvar o grafo, quando os campos ainda são strings de expressão `{{ }}`.

Antes de mandar o node para o sandbox, a engine resolve as expressões `{{ }}` da config contra o contexto da execução: o input recebido, as variáveis de runtime (`$vars`) e os outputs dos nodes já executados. Um id de node inexistente numa expressão vira erro explícito em vez de `undefined` silencioso. Dois campos escapam da resolução de propósito: o `code` do node de código (é JavaScript literal, e a resolução de expressões é cega a chaves), e as raízes `$auth`/`$sig` do node HTTP, que só podem ser resolvidas lá dentro, onde a credencial é lida.

O ciclo de vida de uma execução é curto e explícito. Ela nasce `queued` quando alguém a dispara (manual, webhook, cron, chat, API pública, error workflow) e um job entra na fila. O worker pega o job e faz um **claim atômico**: um `updateMany` condicionado ao status atual vira a linha para `running`. Se o claim não afetar nenhuma linha, outro worker já assumiu e este desiste — é o que protege contra job reentregue por stall. A partir daí a execução termina em `success` ou `failed`, ou pausa em `waiting_approval` se algum node pediu suspensão. O status `canceled` existe no enum e é classificado como terminal, mas nenhum código do repo escreve esse valor: não há cancelamento de execução hoje. A classificação de cada status em "pendente", "aguardando" ou "terminal" mora numa tabela única e exaustiva em `packages/shared/src/execution.ts` (`EXECUTION_PHASE`) — quem precisa saber "isso já acabou?" deriva dali em vez de manter a própria lista.

Quando um node falha, a primeira coisa que acontece é o **retry** configurado no próprio node: um número de tentativas com backoff linear, ainda dentro da mesma execução e do mesmo step lógico (cada tentativa grava seu próprio `ExecutionStep`, numerado por `attempt`). Esgotadas as tentativas, o que decide o destino da execução é o `onError` do node. O padrão é fail-fast: a onda inteira para, a execução vira `failed`, e branches irmãs que estavam indo bem não terminam. Com `onError: "branch"` e uma edge de saída no handle reservado de erro, a falha é roteada por essa edge com um payload de erro — só por ela, nunca pelas edges normais. Com `onError: "continue"`, a falha segue pelas edges normais com o mesmo payload de erro, como se o node tivesse dado certo, sem precisar desenhar uma edge dedicada. Nos dois casos o `ExecutionStep` continua gravado como `failed` — o caminho tratado muda o fluxo, não o histórico. Independente disso, uma execução que termina em `failed` pode disparar o **error workflow** configurado no fluxo: outro workflow, do mesmo workspace, que recebe um payload descrevendo a falha. Essa cadeia tem profundidade máxima 1 por construção — a execução do tratador nasce com `triggerType: "event"`, e execuções `event` nunca disparam outro tratador.

**Retry e replay são coisas diferentes.** "Tentar novamente" cria uma execução nova do zero, com o mesmo input original, apontando para a original como pai. O replay pode ser completo (do trigger, opcionalmente com um input diferente) ou **parcial**, a partir de um node específico: nesse caso os nodes ancestrais do ponto de partida não são re-executados — seus outputs são lidos dos `ExecutionStep` bem-sucedidos da execução pai e reinjetados como se tivessem acabado de rodar. O `$vars` acumulado é reconstituído do mesmo jeito, a partir do campo `varsPatch` de cada step: um step grava ali o patch de variáveis que ele produziu (hoje o node Set Variables e o node de código), e o replay aplica esses patches na ordem de início dos steps. Sem `varsPatch`, os ancestrais reaproveitados devolveriam output mas nenhuma variável, e todo fluxo que dependesse de `$vars` quebraria no replay.

A suspensão é um mecanismo genérico da engine, e não um caso especial de aprovação. Um node pode devolver, em vez de um output, um **descritor de suspensão** — uma razão, uma referência opaca para a pendência no domínio do node, e um rótulo. A engine nunca interpreta o conteúdo desse descritor. Quando ele aparece, o node não "aconteceu" do ponto de vista do resto do grafo: nada é roteado a partir dele, seu output não entra no contexto, e o step é gravado com status `waiting_approval` em vez de `success`. A onda corrente ainda drena normalmente (os irmãos do node suspenso terminam), e só então a engine serializa todo o frontier da execução — outputs acumulados, `$vars`, buffers de merge, conjunto de nodes já executados, totais de token e custo — numa linha de `ExecutionPausedState`, versionada e com teto de tamanho, e vira o status para `waiting_approval`. Na retomada, o mesmo `run()` é chamado com o node e o dado da decisão; ele restaura o frontier, reexecuta só o node suspenso (agora com o dado da decisão disponível) e segue dali. O tempo parado não conta no `durationMs`: a execução acumula o tempo real de processamento entre pausas num campo separado. O mecanismo de aprovação humana que usa isso está descrito em [Aprovação humana](04-aprovacao-humana.md).

Duas redes de segurança cobrem o caso do worker morrer. Se `engine.run()` lançar antes de gravar um status final, o processor marca a execução como `failed` — mas só se ela ainda estiver num status pendente, o que torna a operação idempotente. E, no boot, todo worker varre execuções presas em `running` há mais tempo do que qualquer execução legítima levaria e as marca como `failed`, para que ninguém fique olhando um spinner eterno. Essa varredura usa o timestamp do último claim, não o de criação da execução — do contrário, uma execução retomada depois de dias pausada seria falsamente considerada travada.

## Onde vive

| Arquivo                                                     | Papel                                                                                                                       |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/engine/engine.service.ts`                     | O executor: percurso por ondas, roteamento de edges, retry, caminhos de erro, suspensão/retomada, gravação de steps e logs. |
| `apps/api/src/engine/sandbox/node-sandbox-runner.ts`        | Cria o worker_thread por node: timeout duro, limite de heap, allowlist de env, ponte RPC dos callbacks de contexto.         |
| `apps/api/src/engine/sandbox/node-worker-entry.ts`          | O que roda dentro da thread: valida a config contra o `configSchema` do node e chama o `execute()`.                         |
| `apps/api/src/engine/sandbox/sandbox-messages.ts`           | Formato das mensagens que cruzam a fronteira da thread.                                                                     |
| `apps/api/src/executions/executions.service.ts`             | Criação e enfileiramento de execuções (todos os triggers), listagem, detalhe, retry, replay, enfileiramento de retomada.    |
| `apps/api/src/executions/executions.controller.ts`          | Rotas autenticadas de execução, incluindo o stream SSE.                                                                     |
| `apps/api/src/executions/executions.processor.ts`           | Consumer BullMQ da fila `executions`; chama a engine e aplica a rede de segurança para crash antes do status final.         |
| `apps/api/src/executions/error-workflow.service.ts`         | Dispara o fluxo tratador de erro de um workflow que falhou, com guarda anti-recursão.                                       |
| `apps/api/src/execution-events/execution-events.service.ts` | Barramento de eventos da execução: publica no Redis (worker) e serve como Observable SSE (API).                             |
| `apps/api/src/worker.main.ts`                               | Entrypoint do processo do worker — sem HTTP, só consome filas.                                                              |
| `apps/api/src/worker/worker.module.ts`                      | Onde cada Processor é registrado; é o que garante que a API nunca rode jobs no próprio processo.                            |
| `apps/api/src/worker/orphan-recovery.service.ts`            | No boot, mata execuções presas em `running` além do limiar (padrão 10 min).                                                 |
| `apps/api/src/worker/worker-heartbeat.service.ts`           | Grava uma chave de heartbeat no Redis a cada 10s (TTL 30s), lida pelo readiness da API.                                     |
| `apps/api/src/queue/queue.module.ts`                        | Conexão do BullMQ e registro das filas.                                                                                     |
| `packages/shared/src/execution.ts`                          | Tipos de execução e a tabela `EXECUTION_PHASE`, de onde toda noção de "terminal"/"pendente" é derivada.                     |
| `packages/nodes/src/types.ts`                               | Contrato de um node: contexto de execução, resultado, `SuspendDescriptor`.                                                  |

**Rotas da API**

| Rota                          | O que faz                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `GET /executions`             | Lista paginada e filtrável (fluxo, status, período, busca por nome).             |
| `GET /executions/:id`         | Detalhe com todos os steps e logs.                                               |
| `POST /executions/:id/retry`  | Cria uma execução nova do zero com o input original.                             |
| `POST /executions/:id/replay` | Replay completo ou parcial a partir de um node, opcionalmente com input editado. |
| `GET /executions/:id/stream`  | Stream SSE de eventos daquela execução (ADR-003).                                |

Retry e replay recusam com 409 uma execução em `waiting_approval` — decidir (ou deixar o timeout agir) vem antes de tentar de novo.

**Models Prisma**

| Model                  | Papel                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `Execution`            | Uma execução: status, trigger, payloads, duração, tokens/custo, `traceId` que agrupa a original com seus replays, ponteiro para o pai. |
| `ExecutionStep`        | Uma tentativa de um node: input, output, erro, duração, tokens/custo/modelo, memória, `attempt` e `varsPatch`.                         |
| `ExecutionLog`         | Log estruturado emitido de dentro de um node, com nível e payload.                                                                     |
| `ExecutionPausedState` | O frontier serializado de uma execução pausada, versionado (uma linha por execução).                                                   |

**Filas BullMQ**

| Fila         | O que processa                                                                               |
| ------------ | -------------------------------------------------------------------------------------------- |
| `executions` | Rodar (e retomar) execuções. Concorrência configurável, padrão 5.                            |
| `ingestion`  | Ingestão de documentos da base de conhecimento — ver [Knowledge e RAG](09-knowledge-rag.md). |
| `mcp-health` | Health check dos servidores MCP conectados — ver [MCP](10-mcp.md).                           |
| `schedules`  | Disparo de fluxos por cron — ver [Triggers e scheduler](06-triggers-scheduler.md).           |
| `approvals`  | Sweeper de aprovações vencidas — ver [Aprovação humana](04-aprovacao-humana.md).             |

## Como se conecta

- Consome o grafo e a versão produzidos por [Workflows e versionamento](02-workflows-versionamento.md): a execução fixa um `versionId` no momento em que nasce e roda aquele snapshot até o fim, mesmo que o fluxo seja editado no meio do caminho.
- Executa os `execute()` do catálogo descrito em [Nodes: catálogo](03-nodes-catalogo.md); os callbacks de contexto que atravessam o sandbox são a porta de entrada para [Agents](08-agents.md), [Knowledge e RAG](09-knowledge-rag.md), [MCP](10-mcp.md) e [Chat e inbox](07-chat-inbox.md).
- É acionada por [Triggers e scheduler](06-triggers-scheduler.md) (manual, webhook, cron), pela [Flow API pública](05-flow-api-publica.md) e pelo chat.
- Pausa e retoma pelo mecanismo detalhado em [Aprovação humana](04-aprovacao-humana.md).
- Emite métricas, logs estruturados, traços e eventos consumidos por [Observabilidade e deploy](14-observabilidade-deploy.md); o [Editor web](13-web-editor.md) consome o SSE para animar a execução ao vivo.

## Decisões e histórico

- [ADR-003](../adr/003-streaming-sse.md) — SSE (e não WebSocket) para progresso de execução; revisado na Fase 10 para publicar via Redis pub/sub, já que quem emite é o worker e quem serve o stream é a API.
- [ADR-005](../adr/005-isolamento-execucao-nodes.md) — por que cada node roda num worker_thread com timeout duro e limite de memória, em vez de uma race de Promise no processo principal.
- [ADR-008](../adr/008-worker-separado.md) — por que o worker é um processo separado da API, com o mesmo codebase e deploy independente.
- [ADR-010](../adr/010-observabilidade.md) — logging estruturado, métricas, health e telemetria que a engine alimenta.
- [ADR-011](../adr/011-pausa-duravel.md) — por que a pausa é durável (estado no Postgres) em vez de manter a execução viva na memória do worker.
- [spec-h2-05](../produto/spec-h2-05-continue-on-error-error-workflow.md) — `continueOnError` por node e fluxo tratador de erro.
- [spec-h2-06](../produto/spec-h2-06-aprovacao-humana.md) — a suspensão genérica nasceu aqui, junto com `EXECUTION_PHASE` (commit `c9b9da7`, que passou a derivar as listas de status terminal/pendente da tabela em vez de repeti-las em quatro lugares).
- [plano-h1](../produto/plano-h1.md) e [discovery-h2](../produto/discovery-h2.md) — contexto das fases anteriores e o levantamento que originou o H2.
- Não há ADR para o modelo de ondas em si nem para a política de fail-fast por onda: as duas decisões só existem como comentário no código (`apps/api/src/engine/engine.service.ts:165` e `:555`). O ADR-011 descreve o modelo de ondas em detalhe, mas ao explicar o _contexto_ da pausa, não como decisão própria.

## Limitações e fora de escopo

- **Não há cancelamento de execução.** O status `canceled` existe no enum e é tratado como terminal, mas nenhum código escreve esse valor e não existe rota para isso.
- **Fail-fast por onda.** Uma falha não tratada derruba a execução inteira, inclusive branches irmãs que estavam indo bem e já poderiam ter terminado.
- **Um node executa no máximo uma vez por execução.** O conjunto de nodes já executados barra qualquer re-entrada, então ciclos no grafo não iteram — repetição precisa acontecer dentro de um node, não no desenho do grafo.
- **Replay parcial enxerga só o pai imediato.** Um replay de replay lê os steps do `parentExecutionId` direto, não a cadeia inteira, e nunca reaproveita o output de steps `failed` — inclusive os de falha tratada por caminho de erro.
- **Determinismo limitado dentro de uma onda.** Dois nodes que escrevem a mesma chave de `$vars` na mesma onda rodam em `Promise.all`; qual vence não é definido. O mesmo vale para dois `api.respond` na mesma onda (o primeiro do array vence, e a engine só emite um aviso).
- **Teto de 1 MB no estado serializado da pausa.** Um fluxo com muitos outputs acumulados falha explicitamente ao tentar pausar, em vez de gravar um blob gigante.
- **Formato do estado pausado sem migração.** Se a versão do formato mudar entre um deploy e outro, a retomada falha de propósito e o usuário precisa reiniciar a execução do zero.
- **O orphan recovery só roda no boot do worker.** Uma execução que trava enquanto o worker segue vivo fica presa em `running` até o próximo reinício; a rede de segurança do processor só cobre o caso em que a engine lançou.
- **Retry é linear e por node.** Não há retry exponencial nem jitter, e não há política de retry no nível da execução inteira.
- **Cobertura de teste desigual.** A engine tem testes unitários (`engine.service.spec.ts`), mas boa parte dos `execute()` de node ainda não tem — ver o levantamento em [base-evolucao](../produto/base-evolucao.md).
