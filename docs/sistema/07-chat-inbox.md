# Chat público e inbox

> Última revisão: 2026-08-03 · commit `93468bf`

## O que faz

O chat público transforma um fluxo em um atendimento conversacional acessível por um link, sem login e sem embed de terceiros. Um fluxo que tenha o node `trigger.chat` ganha, ao ser salvo, dois tokens opacos e independentes: um vira a URL do **visitante**, outro vira a URL da **inbox** do atendente humano. As duas páginas são públicas — quem tem o link entra.

O modelo mental é o de uma sessão persistente. Uma `Conversation` é criada uma vez por visitante e sobrevive entre mensagens; o navegador guarda o id no `localStorage` e o reusa ao voltar. Cada mensagem que o visitante manda **dispara uma execução nova** do fluxo, com `triggerType: 'chat'`. Ou seja: o fluxo não fica "rodando" durante a conversa, ele roda uma vez por turno. O que dá continuidade entre turnos são dois campos da conversa. O `state` espelha as `$vars` da última execução bem-sucedida e é reinjetado como estado inicial da próxima — é assim que um carrinho ou uma etapa de funil sobrevive. E o histórico das últimas mensagens vai junto no payload de entrada, para o fluxo poder alimentar um node de IA sem precisar consultar o banco.

O `state` só é regravado quando a execução termina em sucesso, deliberadamente: uma falha no meio do fluxo não deve sobrescrever um estado válido com um parcial. Quando a execução falha, o visitante recebe uma mensagem de erro configurável no próprio node de trigger, para nunca ficar sem resposta — a conversa parece continuar mesmo quando o backend quebrou.

Do lado de saída, quem fala é o node `chat.reply`. Ele pode aparecer várias vezes no mesmo fluxo e é passthrough, então responder no meio do caminho não interrompe o dado em trânsito. Toda mensagem de bot passa por um ponto único na engine, que grava a `ConversationMessage` amarrada à execução que a gerou — é esse vínculo que permite, mais tarde, olhar uma resposta e saber exatamente qual execução a produziu. No canal `web`, "enviar" significa só gravar no banco: a página do visitante lê por polling, não há WebSocket nem SSE aqui.

A inbox é o escape hatch humano. Ela lista todas as conversas daquele fluxo, ordenadas por atividade, e deixa o atendente responder manualmente. A diferença essencial em relação ao visitante: a mensagem do operador **não dispara execução nenhuma** — ela só é gravada e aparece para o visitante no próximo polling. Não existe, hoje, um modo "assumido pelo humano": o fluxo continua respondendo a cada mensagem do visitante, mesmo com um operador digitando. Bot e humano falam ao mesmo tempo.

O gate de status também difere entre as duas portas. O link do visitante rejeita fluxo arquivado, pelo mesmo motivo que o webhook rejeita: arquivar é o "desligar". O link da inbox não tem gate — o atendente precisa continuar lendo o histórico de um fluxo já arquivado.

## Onde vive

| Arquivo                                              | Papel                                                                                                                             |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/chat/chat.service.ts`                  | Todo o comportamento: resolve fluxo por token, cria conversa, grava mensagem, monta o payload e dispara a execução.               |
| `apps/api/src/chat/chat.controller.ts`               | Rotas públicas do visitante.                                                                                                      |
| `apps/api/src/chat/chat-inbox.controller.ts`         | Rotas públicas do atendente.                                                                                                      |
| `apps/api/src/chat/chat-rate-limit.ts`               | Rate limit em memória por IP (30/min), empilhado sobre o throttler global — proteção contra flood acidental, não contra ataque.   |
| `apps/api/src/engine/engine.service.ts`              | Injeta o `state` da conversa nas `$vars` iniciais, atende o RPC `sendChatMessage` do node e regrava o `state` no fim da execução. |
| `packages/nodes/src/definitions/chat-reply.ts`       | Node `chat.reply` — a saída do fluxo para dentro da conversa.                                                                     |
| `packages/nodes/src/definitions/chat-trigger.ts`     | Node `trigger.chat` — guarda os dois tokens e as mensagens de boas-vindas e de erro.                                              |
| `apps/web/src/components/chat/chat-conversation.tsx` | Página do visitante: retoma a conversa do `localStorage` e faz polling das mensagens.                                             |
| `apps/web/src/components/chat/inbox-view.tsx`        | Página do atendente: lista de conversas + thread.                                                                                 |
| `apps/web/src/hooks/use-chat.ts`                     | Hooks de polling (2,5s nas mensagens; 4s na lista de conversas).                                                                  |
| `apps/web/src/proxy.ts`                              | `/chat` e `/inbox` estão em `PUBLIC_ROUTES`; sem isso o middleware redirecionaria o visitante para o login.                       |

**Rotas da API** — todas marcadas `@Public()`, fora do guard de sessão.

| Rota                                                             | O que faz                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `POST /public/chat/:chatToken/conversations`                     | Cria a conversa e já devolve a mensagem de boas-vindas, se configurada.  |
| `POST /public/chat/:chatToken/conversations/:id/messages`        | Grava a mensagem do visitante e dispara a execução do fluxo.             |
| `GET /public/chat/:chatToken/conversations/:id/messages`         | Leitura por polling. Sem rate limit específico, porque não dispara nada. |
| `GET /public/chat-inbox/:inboxToken/conversations`               | Lista as conversas do fluxo com a última mensagem de cada.               |
| `GET /public/chat-inbox/:inboxToken/conversations/:id`           | Thread completa de uma conversa.                                         |
| `POST /public/chat-inbox/:inboxToken/conversations/:id/messages` | Resposta manual do atendente. Não dispara o fluxo.                       |

**Páginas web**

| Página           | O que faz                    |
| ---------------- | ---------------------------- |
| `/chat/[token]`  | Chat do visitante, pública.  |
| `/inbox/[token]` | Inbox do atendente, pública. |

**Models Prisma**

- `Conversation` — a sessão. Tem `channel` (só `web` hoje), `externalKey` (identificador do contato num canal externo), `state` (as `$vars` persistidas) e `status` (`open` por padrão). A unicidade é por `workflowId + channel + externalKey`.
- `ConversationMessage` — uma mensagem, com `role` em `user` (visitante), `bot` (node `chat.reply` ou mensagem de erro) ou `operator` (inbox humana), e `executionId` opcional apontando a execução que a gerou.

## Como se conecta

- É uma das portas de entrada catalogadas em [Triggers e scheduler](06-triggers-scheduler.md); o disparo em si passa pelo mesmo caminho de qualquer outro trigger.
- Depende da [Engine de execução](01-engine-execucao.md) para o ciclo completo: ela é quem lê o `state`, atende o `sendChatMessage` e decide o que gravar no fim.
- Os nodes `trigger.chat` e `chat.reply` fazem parte do [Catálogo de nodes](03-nodes-catalogo.md).
- Os tokens nascem no save do grafo — ver [Workflows e versionamento](02-workflows-versionamento.md).
- Fluxos de chat costumam usar nodes de IA e agentes; ver [Agents](08-agents.md) e [Plataforma de IA](11-ai-plataforma.md).
- Contrasta com [Aprovação humana](04-aprovacao-humana.md): as duas são intervenções humanas em fluxos, mas a aprovação **pausa** a execução e o inbox não — ele acontece por fora dela.

## Decisões e histórico

- **Não existe ADR do chat público.** O repo registra isso explicitamente como lacuna em [base-evolucao](../produto/base-evolucao.md) ("não há ADR do chat público nem da decisão 'salvar manual'"). As decisões de design que existem — polling em vez de SSE, `state` só em sucesso, um ponto único de saída de bot — estão apenas em comentários no código.
- [ADR-003](../adr/003-streaming-sse.md) — a plataforma usa SSE para logs de execução; o chat deliberadamente **não** o usa, ficando em polling.
- [SPEC H2-01](../produto/spec-h2-01-correcoes-passagem.md) — origem do gate de `archived` no link do visitante.
- [discovery-h2](../produto/discovery-h2.md) §1 — levantamento do chat como base para canais externos (WhatsApp): registra a ausência de handoff humano, a falta de status de entrega e a cobertura de testes zero nas rotas públicas.
- [base-evolucao](../produto/base-evolucao.md) — anota que o replay parcial de uma execução de chat só preserva `conversationId`/`state` se o node de partida ainda carregar o payload do chat.

## Limitações e fora de escopo

- **Só o canal `web`.** O campo `channel` e o `externalKey` existem no schema como preparação para WhatsApp/Telegram, mas nenhum código os lê ou escreve com outro valor — `externalKey` está sempre nulo hoje.
- **Sem handoff.** Um operador respondendo pela inbox não silencia o fluxo: o bot continua reagindo a cada mensagem do visitante. O campo `Conversation.status` existe (`open`) mas nada o transiciona, e nenhuma rota fecha conversa.
- **Polling, não push.** Mensagens levam até ~2,5s para aparecer, e cada aba aberta é uma requisição periódica constante ao banco.
- **Os links são credenciais permanentes.** Não expiram, não podem ser rotacionados sem regenerar o node, e a inbox — que expõe _todas_ as conversas do fluxo — é protegida só pelo segredo da URL. Não há autenticação de atendente.
- **Rate limit é por processo.** O contador vive em memória; com mais de uma instância da API o limite efetivo se multiplica pelo número de processos.
- **Sem paginação nem busca.** `listMessages` devolve a thread inteira e `listConversations` devolve todas as conversas do fluxo, sem limite. Conversas longas e fluxos movimentados degradam linearmente.
- **Histórico truncado em 10 mensagens** no payload entregue ao fluxo (`chat.service.ts:11`). Um fluxo que precise de mais contexto tem que buscar por conta própria.
- **Sem anexos, sem indicador de digitação, sem status de entrega ou leitura.** Só texto.
- **Cobertura de teste rasa** nas rotas públicas: existe `chat.service.spec.ts`, mas o levantamento do H2 registra os endpoints públicos como o ponto mais frágil da suíte.
