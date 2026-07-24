# ADR-003: SSE para streaming de logs e progresso de execução

Status: Aceito
Data: 2026-07-23

## Contexto

O editor precisa mostrar nodes acendendo em tempo real durante uma execução (Fase 3), e a tela de Executions precisa de logs ao vivo (Fase 6). O fluxo de dados é unidirecional: servidor → cliente.

## Decisão

Usar **Server-Sent Events (SSE)** por execução (`GET /executions/:id/stream`) para progresso e logs em tempo real.

## Alternativas consideradas

- **WebSocket**: mais poderoso (bidirecional), mas exige mais infraestrutura (sticky sessions, gerenciamento de conexão) para um caso de uso que é, na prática, unidirecional. Fica reservado para o dia em que houver necessidade real de comunicação bidirecional (ex.: colaboração em tempo real no canvas).
- **Polling**: simples, mas gera latência perceptível e carga desnecessária na API para atualizações que precisam parecer instantâneas.

## Consequências

- Reconexão de SSE é responsabilidade do cliente (`EventSource` nativo já faz isso); a API precisa suportar replay de eventos perdidos via `Last-Event-ID` quando isso importar.
- Se features futuras exigirem bidirecional (ex.: Copilot com colaboração ao vivo, Fase 11), reavaliar para WebSocket nesse ponto específico, sem migrar o restante do produto.

## Atualização (Fase 10, ver ADR-008)

Com o motor de execução rodando num processo de worker separado da API
(ADR-008), o `EventEmitter` em processo do `ExecutionEventsService` deixou de
bastar — eventos emitidos no worker nunca chegariam aos clientes SSE
conectados na API. `ExecutionEventsService` passou a publicar/assinar via
Redis pub/sub (um canal `execution-events:<executionId>` por execução),
mantendo a mesma interface pública (`emit`/`subscribe`/`toObservable`), então
`ExecutionsController` e `EngineService` não precisaram mudar. Validado
ao vivo nesta fase: um processo separado assinando o canal recebeu, em ordem,
todos os eventos publicados por um worker rodando uma execução real.
