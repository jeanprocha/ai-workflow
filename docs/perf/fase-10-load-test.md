# Teste de carga — Fase 10

Metodologia: 30 execuções de um workflow de 2 nodes (`trigger.manual` →
`logic.log`) enfileiradas de uma vez, contra um único processo de worker
local (`EXECUTIONS_CONCURRENCY=5`, default), medindo o tempo entre o
enfileiramento e o status terminal (`success`/`failed`) de cada execução.
Ambiente: máquina de desenvolvimento (não representa o hardware do Railway
em produção), Postgres/Redis via `docker-compose.dev.yml`.

## Resultado

```
30 execuções enfileiradas em 6ms.
Concluídas: 30/30 (falhas: 0)
P50 = 9037ms
P95 = 14054ms
P99 = 14556ms
max = 14556ms
```

## Leitura

- **0 falhas** em 30 execuções concorrentes — a fila absorveu o burst e o
  worker processou tudo corretamente (fila + `EXECUTIONS_CONCURRENCY=5`
  distribuindo em lotes).
- O custo dominante é o isolamento por node (ADR-005 v3): cada node roda num
  `worker_thread` novo (~650-700ms de overhead de subida, medido
  isoladamente), então uma execução de 2 nodes custa ~1.4s só de sandbox.
  Com 30 execuções / 5 slots concorrentes ≈ 6 lotes sequenciais de ~1.4s
  cada explica o P50 de ~9s; P95/P99 mais altos refletem contenção de CPU
  sob carga (30 threads V8 disputando os núcleos da máquina de dev).
- **Escala horizontal, não vertical**: aumentar `EXECUTIONS_CONCURRENCY`
  num único worker ajuda até o limite de CPU da instância; para cargas
  maiores, o caminho é mais réplicas do serviço `worker` no Railway (ADR-008),
  já que o rate limiting de IA e a fila em si já são compartilhados via Redis
  entre processos.
- **Otimização futura, fora do escopo desta fase**: um pool de
  `worker_threads` reutilizáveis (em vez de um thread novo por execução de
  node) eliminaria a maior parte do overhead de ~650-700ms/node — vale a
  pena se isso se confirmar um gargalo real em produção.
