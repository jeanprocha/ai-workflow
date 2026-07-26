# Roteiro manual — Fase 05: Executions

Complementa `tests/executions/*.spec.ts` (automatizado — lista, detalhe,
retry, replay total/parcial, isolamento por workspace). Aqui é o que exige
olho humano: sensação de "ao vivo", tema, mobile, e um julgamento de produto
sobre uma inconsistência que o automatizado só consegue documentar, não
decidir. Rode local (http://localhost:3000/executions) a menos que a seção
diga "produção". Precisa do worker rodando (`pnpm --filter @workflow/worker
dev`) — sem ele toda execução fica presa em "Na fila" pra sempre.

## Lista

- [ ] Rodar uns 5-6 fluxos diferentes (alguns que dão certo, um que falha de
      propósito) e conferir a tabela: badges com a cor/ícone certos, duração
      com unidade legível (ms vs s), custo só aparece quando há tokens.
- [ ] Combinar os três filtros ao mesmo tempo (fluxo + status + busca) e ver
      se a combinação faz sentido, não só cada um isolado.
- [ ] Com mais de 20 execuções, navegar Anterior/Proxima algumas vezes —
      sensação de velocidade, não pisca a tabela inteira de forma incômoda.
- [ ] Tema claro e escuro: contraste dos badges (verde sucesso, vermelho
      falha, o "Na fila" cinza costuma ser o mais difícil de ver).
- [ ] Largura de celular (~375px): a tabela quebra ou vira scroll horizontal?
      Anotar a impressão — hoje não há layout mobile dedicado pra tabelas.

## Detalhe / Timeline

- [ ] Abrir o detalhe de uma execução com vários nodes e olhar a timeline —
      a ordem visual (de cima pra baixo) corresponde à ordem real de
      execução do fluxo?
- [ ] Nos steps, expandir/olhar Input e Output com payloads grandes
      (um objeto JSON aninhado de verdade) — o JsonViewer rola bem, o botão
      "Copiar JSON" (aparece no hover) copia o conteúdo certo pra área de
      transferência.
- [ ] Numa execução falhada, o banner de erro no topo é claramente
      diferenciado (cor, posição) do "Erro" que aparece dentro do step que
      falhou — não deveria confundir qual é qual.

## Replay (total e parcial)

- [ ] Replay total (botão "Reexecutar" no topo) numa execução falhada por
      HTTP — conferir que a nova execução realmente tenta de novo do zero
      (todos os steps reaparecem na timeline nova, não só o que falhou).
- [ ] Replay parcial ("Replay a partir daqui" num step) — editar o JSON do
      input manualmente antes de confirmar; sentir se o textarea monoespaçado
      é confortável pra editar JSON com a mão.
- [ ] Encadear replays (replay de um replay) e seguir a corrente de links
      "outra execução" até a execução original — não deveria quebrar nem
      formar um link morto.

## Execução ao vivo (SSE)

- [ ] Rodar um fluxo com um node de delay (alguns segundos) e ficar olhando
      a tela: "Logs (ao vivo)" deve sumir e o "(ao vivo)" ao lado do título
      também, exatamente quando o badge vira "Sucesso" — não antes, não com
      atraso perceptível.
- [ ] Deixar a aba em segundo plano durante uma execução ao vivo e voltar —
      os logs devem ter continuado chegando (SSE não deve cair só por trocar
      de aba).
- [ ] Abrir a mesma execução em duas abas ao mesmo tempo enquanto roda — as
      duas devem mostrar os mesmos logs, sem duplicar em nenhuma delas.

## AI Debugger

- [ ] Numa execução falhada, abrir "Diagnosticar com IA" com uma credencial
      de verdade configurada e rodar o diagnóstico completo — julgar se a
      causa provável sugerida faz sentido pro erro real.
- [ ] Aplicar uma correção sugerida e conferir que uma versão nova do fluxo
      foi salva com a mudança certa (abrir o editor depois pra confirmar).

## Notas técnicas conhecidas (não são bugs pra reportar de novo)

- O filtro de status na lista usa os valores brutos em inglês (`queued`,
  `running`, `success`, `failed`, `canceled`) como texto das opções, em vez
  dos rótulos traduzidos que os badges mostram ("Na fila", "Executando" etc).
  **Decisão de produto pendente**: vale a pena traduzir as opções do select
  (perdendo a correspondência 1:1 com o valor da query) ou deixar como está
  por ser mais previsível pra quem inspeciona a URL/API?
- O badge "Falhou" também é usado pro status `canceled` — hoje nada no
  código cria execuções `canceled` (não há botão de cancelar), então na
  prática isso nunca aparece, mas se um cancelamento for implementado no
  futuro ele vai ficar visualmente idêntico a uma falha real.
- Replay parcial não reconstitui `vars` setadas por `logic.setVariables` em
  steps anteriores reaproveitados — se o fluxo depender dessas variáveis
  depois do ponto de replay, o comportamento pode diferir da execução
  original.
- `Duração` inclui o tempo que a execução ficou esperando na fila antes do
  worker pegar (não é só o tempo de processamento).

## Smoke em produção (fazer só depois que tudo acima passar localmente)

Ambiente: `https://web-nine-beige-85.vercel.app` (frontend) +
`https://api-production-cb36.up.railway.app` (API).

- [ ] Abrir a lista de Executions e conferir que carrega com dados reais.
- [ ] Abrir o detalhe de uma execução recente e conferir timeline/logs.

Não repita este smoke a cada mudança pequena — só antes/depois de um deploy
real, pra confirmar que produção está saudável.

## O que anotar se algo falhar

Pra cada item que falhar: o que você esperava vs. o que aconteceu, browser +
versão, e se reproduz de novo repetindo o passo. Isso vira ponto de partida
pra investigação, não precisa já vir com causa raiz.
