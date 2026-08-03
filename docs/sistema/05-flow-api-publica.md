# Publicar um fluxo como API

> Última revisão: 2026-08-02 · commit `80da213`

## O que faz

Um fluxo desenhado no editor vira um endpoint HTTP estável, autenticado por
chave, que devolve o **resultado da execução na mesma chamada**. É o que
transforma um fluxo num serviço consumível por qualquer sistema externo, sem que
o consumidor precise saber que existe um editor visual por trás.

Isso é deliberadamente um produto diferente do webhook. O webhook continua sendo
a URL-capacidade simples de "cole essa URL no seu sistema": entrada crua,
fire-and-forget, sem identidade e sem caminho de volta. A API publicada tem
identidade (chaves revogáveis, uma ou várias por fluxo), tem resposta e tem
limites. As duas entradas convergem no mesmo motor: por baixo, um invoke é
tratado como um disparo de webhook autenticado, então **fluxo publicável é fluxo
com trigger de webhook**, e o invoke exige que o fluxo esteja **ativo** — mais
estrito que o webhook, onde um rascunho dispara para teste.

A **autenticação** é por chave Bearer com prefixo `wfk_`. O valor bruto existe uma
única vez, na resposta da criação; o banco guarda só o hash e os quatro últimos
caracteres, para a UI conseguir identificar a chave numa lista. Revogar é marcar
uma data, nunca apagar. O guard recusa com **uma mensagem única** para chave
ausente, malformada, inexistente, revogada ou pertencente a outro fluxo —
diferenciar esses casos só serviria de oráculo de enumeração.

O **modo síncrono** é o caso de uso central, e a forma como ele funciona é a parte
menos óbvia do domínio. A engine roda no processo do worker, não no da API, então
o handler HTTP não tem como "executar e devolver". A implementação enfileira a
execução e depois faz **polling do banco** com uma rampa de backoff — rápido nas
primeiras tentativas, mais espaçado conforme o tempo passa, com jitter para que
uma rajada de invokes concorrentes não bata no banco em lockstep. Isso é seguro
porque a engine grava status, output, erro e duração num único `UPDATE`: um
`SELECT` que vê um status terminal já enxerga o output no mesmo snapshot, sem
corrida.

O síncrono **degrada para aceito-mas-ainda-rodando** (HTTP 202, com a URL de
consulta do resultado) em quatro situações: o cliente pediu explicitamente o modo
assíncrono, o tempo de espera estourou, o cliente fechou a conexão, ou não havia
capacidade. Essa última é um teto de conexões HTTP presas simultaneamente — cada
espera síncrona segura um socket e um timer por até um minuto, e estourado o
teto é melhor responder na hora do que empilhar. A resposta é sempre o mesmo
envelope JSON, tanto no 200 quanto no 202 quanto na consulta posterior.

Qual dado vira "o resultado" não é óbvio num grafo com paralelismo: o padrão é a
saída do último node executado, que com fan-out é acidental. Para tornar isso
determinístico existe o node **`api.respond`**, um passthrough que **marca** sua
saída como a resposta do endpoint — o dado continua fluindo para o próximo node
normalmente. O primeiro `api.respond` a rodar vence.

O que decide se a execução acabou é o mapa de **fases de status** em
`packages/shared/src/execution.ts`: um `Record` exaustivo que classifica cada
status de execução como pendente, em espera ou terminal. Isso não é detalhe de
estilo — é a correção de um bug real (`c9b9da7`). Antes, o waiter e o controller
tinham cada um sua própria lista manual de status, e quando
[aprovação humana](04-aprovacao-humana.md) introduziu `waiting_approval`, esse
status caiu no vão entre as duas: o waiter corretamente não o via como terminal,
mas o controller também não o via como pendente, e o invoke síncrono devolvia
**200 com output nulo** para uma execução que estava apenas pausada. Derivar tudo
de um único `Record` exaustivo faz um status novo sem entrada quebrar o build, em
vez de passar em silêncio.

Além do throttle global por IP da API inteira, existe um **rate limit por chave**,
em memória, com janela de um minuto. O global sozinho não bastaria: dois
consumidores atrás do mesmo IP dividiriam o mesmo teto, e um consumidor com duas
chaves não teria como ser tratado separadamente. Há também um registro do último
uso de cada chave, com escrita limitada a uma vez por minuto por chave para não
gerar um `UPDATE` a cada invoke.

## Onde vive

| Arquivo                                              | Papel                                                                                   |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `apps/api/src/flow-api/flow-api.controller.ts`       | O endpoint público: invoke (síncrono/202) e consulta de resultado.                      |
| `apps/api/src/flow-api/execution-waiter.ts`          | Polling com backoff, clamp do timeout e o cap de esperas simultâneas.                   |
| `apps/api/src/flow-api/guards/flow-api-key.guard.ts` | Resolve o Bearer, confere que a chave é do fluxo da URL, aplica o rate limit por chave. |
| `apps/api/src/flow-api/api-keys.service.ts`          | Emissão (valor bruto só uma vez), listagem sem o hash, revogação, resolução por hash.   |
| `apps/api/src/flow-api/api-keys.controller.ts`       | CRUD autenticado das chaves, escopado ao workspace.                                     |
| `apps/api/src/flow-api/flow-api-rate-limit.ts`       | Janela por chave em memória, com eviction.                                              |
| `apps/api/src/executions/executions.service.ts`      | `triggerByApiKey` (exige fluxo ativo) e a consulta escopada ao par fluxo/execução.      |
| `packages/shared/src/execution.ts`                   | `EXECUTION_PHASE` e as listas derivadas de status terminais/pendentes.                  |
| `packages/nodes/src/definitions/api-respond.ts`      | O node que marca a resposta do endpoint.                                                |
| `apps/api/src/engine/engine.service.ts`              | Aplica a regra "respond vence o último output" ao gravar o resultado.                   |
| `apps/web/src/components/editor/config-panel.tsx`    | Seção "Publicar como API" dentro do painel do `trigger.webhook`.                        |
| `apps/web/src/hooks/use-flow-api-keys.ts`            | Hooks de listar/criar/revogar chaves.                                                   |

**Rotas da API**

| Rota                                                | O que faz                                                                                    |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `POST /v1/flows/:workflowId/invoke`                 | Dispara o fluxo. Síncrono por padrão; `?mode=async` e `?timeoutMs=` ajustam o comportamento. |
| `GET /v1/flows/:workflowId/executions/:executionId` | Busca o resultado depois, com a mesma chave.                                                 |
| `GET /workflows/:id/api-keys`                       | Lista as chaves do fluxo (autenticado, sem o hash).                                          |
| `POST /workflows/:id/api-keys`                      | Emite uma chave; é a única resposta que contém o valor bruto.                                |
| `DELETE /workflows/:id/api-keys/:keyId`             | Revoga.                                                                                      |

**Páginas web**

| Página                               | O que faz                                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| Editor → painel do `trigger.webhook` | Mostra a URL do endpoint, gerencia chaves e exibe um `curl` de exemplo. Não há tela própria. |

**Models Prisma**

- `WorkflowApiKey` — chave por fluxo: nome, hash único, quatro últimos
  caracteres, último uso e data de revogação. Nunca apagada.

**Variáveis de ambiente**

- `FLOW_API_MAX_SYNC_WAITERS` — teto de esperas síncronas simultâneas.
- `FLOW_API_DEFAULT_TIMEOUT_MS` — tempo de espera padrão do modo síncrono (o
  `?timeoutMs=` da requisição é limitado por um piso e um teto no código).
- `FLOW_API_RATE_LIMIT` — requisições por minuto por chave.

## Como se conecta

- Reaproveita inteiramente [triggers e scheduler](06-triggers-scheduler.md): o
  invoke entra pelo `trigger.webhook` e é registrado como disparo de webhook.
- Não fala com a [engine](01-engine-execucao.md) diretamente — enfileira e
  observa o banco, porque a engine vive no worker.
- Depende de [workflows e versionamento](02-workflows-versionamento.md) para
  exigir fluxo ativo e para carregar a versão corrente.
- O node `api.respond` é uma definição comum do
  [catálogo de nodes](03-nodes-catalogo.md).
- O acoplamento com [aprovação humana](04-aprovacao-humana.md) é indireto mas
  real: um fluxo com aprovação nunca termina na janela síncrona, e sempre cai no 202.
- O CRUD de chaves usa o guard de workspace de
  [auth e workspaces](12-auth-workspaces.md); o throttle global e as métricas,
  [observabilidade e deploy](14-observabilidade-deploy.md).

## Decisões e histórico

- [SPEC H2-04](../produto/spec-h2-04-publicar-como-api.md) — o spec completo, com
  as alternativas rejeitadas. Vale ler as decisões 3, 5 e 10 em especial: **o
  discovery que precedeu a implementação derrubou o mecanismo síncrono
  originalmente proposto** (assinar o canal pub/sub de eventos de execução), por
  três motivos concretos — a inscrição no Redis não é aguardada, não há replay
  nem buffer, e o subscriber é compartilhado com o SSE do editor, então um invoke
  que desistisse podia derrubar o live view de quem estivesse editando. O polling
  do banco entrou no lugar; consertar a camada de eventos ficou como tema
  separado.
- [ADR-008](../adr/008-worker-separado.md) — o worker separado da API é a
  premissa que torna o modo síncrono um problema em primeiro lugar.
- [ADR-003](../adr/003-streaming-sse.md) — a camada de eventos/SSE que foi
  avaliada e descartada para este uso.
- Commit `c9b9da7` e [ADR-011](../adr/011-pausa-duravel.md) — a introdução de
  `waiting_approval` e a consolidação das fases de status num `Record` exaustivo.
- Não há ADR dedicado ao formato ou ao ciclo de vida da chave de API; o
  raciocínio (prefixo `wfk_`, hash com lookup por índice único dispensando
  comparação em tempo constante, revogação sem hard delete) está na decisão 2 do
  spec e em comentário no `api-keys.service.ts`.

## Limitações e fora de escopo

- **Não existe OpenAPI/Swagger.** A documentação da API publicada é o snippet de
  `curl` na UI do editor. Uma especificação global ficou para depois — o que
  significa que consumidores não têm contrato legível por máquina e nenhum
  cliente é gerado automaticamente.
- **Publicar e salvar são a mesma operação.** O invoke sempre roda a versão
  corrente do fluxo, então um Ctrl+S no editor muda a API pública na hora. Não há
  ponteiro duplo rascunho/publicado. A resposta carrega o identificador da versão
  usada, o que dá rastreabilidade mas não estabilidade.
- **O modo síncrono é polling, não push.** Custa alguns milissegundos de latência
  extra e um `SELECT` por tentativa, e nunca vai devolver resultado de execução
  longa: o tempo máximo de espera é limitado por código.
- **Qualquer execução pausada cai no 202.** Um fluxo com aprovação humana nunca
  responde de forma síncrona, por construção.
- **O rate limit por chave é por instância**, guardado em memória. Com mais de uma
  réplica da API o limite efetivo se multiplica; a coordenação via Redis é
  trabalho futuro.
- **A resposta é sempre o envelope da plataforma.** Não há corpo cru, nem status
  code ou headers customizáveis pelo `api.respond`.
- **A chave não tem escopo nem permissão** além de "este fluxo": nada de
  somente-leitura, restrição por IP, expiração automática ou chave de workspace.
  Controle de acesso mais fino é outro tema.
- **Sem analytics por chave.** O único dado de uso registrado é a data do último
  uso, com escrita limitada a uma por minuto; o disparo é contabilizado como
  webhook, sem um tipo de trigger próprio para a API.
- **Nada de idempotência.** Não há chave de idempotência nem deduplicação: um
  retry do cliente cria uma execução nova.
