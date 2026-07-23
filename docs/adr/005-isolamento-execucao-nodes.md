# ADR-005: Isolamento de execução de nodes

Status: Aceito
Data: 2026-07-23

## Contexto

Cada node executa código (chamadas HTTP, IA, banco, transformação de arquivos) dentro do processo que consome a fila de execuções. Um node lento, travado ou malicioso não pode derrubar outras execuções.

## Decisão

- **v1 (Fase 3–9):** execução in-process no worker da API, com **timeout obrigatório por node** e captura de exceção por step — suficiente enquanto a engine roda em processo único e a confiança no código dos nodes é alta (nodes nativos, mantidos pelo time).
- **v3 (Fase 10):** workers dedicados por tipo de node (ou pelo menos por categoria de risco: nodes que executam código arbitrário vs. nodes de integração simples), com limite de memória e sandbox mais estrito.

## Alternativas consideradas

- **Sandbox completo desde o v1 (VM isolada / container por execução)**: mais seguro, mas adiciona latência e complexidade operacional incompatível com o ritmo do MVP.
- **Sem timeout/isolamento algum**: inaceitável — um único HTTP Request pendurado travaria a fila inteira.

## Consequências

- Timeout por node é obrigatório desde a Fase 3, não uma otimização futura.
- A revisão de segurança antes de nodes de terceiros no Marketplace (Fase 9) depende do isolamento mais forte da Fase 10 estar pronto — nodes de comunidade só devem rodar em sandbox reforçado.
