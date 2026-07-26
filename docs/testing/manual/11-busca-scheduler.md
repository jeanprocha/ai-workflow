# Roteiro manual — Fase 11: Busca global (Ctrl+K) e Scheduler (cron de fluxo)

Complementa `tests/search-scheduler/*.spec.ts` (automatizado — 16 testes: 6 de
busca global, 4 de CronFields no editor, 6 de API do scheduler incluindo um
teste lento de disparo real de cron). Aqui é o que só dá pra julgar sentindo a
interação de verdade: velocidade percebida, clareza dos grupos de resultado,
se o fluxo de agendar um cron é intuitivo pra quem nunca usou.

## Busca global (Ctrl+K)

- [ ] Abrir com `Ctrl+K` de qualquer página autenticada — o atalho responde
      igual em Mac (`Cmd+K`) e Windows/Linux?
- [ ] Digitar um termo bem genérico (ex.: uma letra só) — os resultados
      aparecem rápido o suficiente pra não parecer travado, mesmo sem
      indicador de loading?
- [ ] Digitar e apagar rapidamente (testar o debounce de 250ms na prática) —
      dá pra sentir o delay, ou é imperceptível?
- [ ] Buscar um termo que aparece em mais de um grupo ao mesmo tempo (ex.: um
      fluxo e um node com nomes parecidos) — os grupos "Fluxos", "Nodes",
      "Execuções", "Templates", "Agentes" ficam claros visualmente, ou tudo
      se mistura?
- [ ] Navegar só pelo teclado (setas + Enter) do início ao fim, sem tocar no
      mouse — dá pra completar uma busca e abrir o resultado inteiramente
      às cegas (útil pra usuário de teclado/leitor de tela)?
- [ ] Testar em português e inglês (trocar o idioma em Configurações) — o
      rótulo da lista de resultados e os grupos traduzem certo (valida fix
      A3 — antes a lista se anunciava "Suggestions" hardcoded em inglês)?

## Scheduler (agendamento cron de fluxo)

- [ ] Criar um fluxo novo, adicionar um node "Schedule" (trigger.cron) e
      configurar pelos presets (ex.: "Diariamente às 9h") — o texto do preset
      corresponde ao que a expressão cron realmente faz?
- [ ] Digitar uma expressão cron à mão com erro de digitação comum (ex.:
      esquecer um campo, ou um valor fora do range) — a mensagem de erro
      ajuda a entender o que corrigir, ou é só o texto cru da lib?
- [ ] Trocar o timezone e comparar os horários calculados — bate com o que
      você esperava pra esse timezone (considerando o fluxo do relógio de
      24h)?
- [ ] Habilitar o agendamento, salvar o fluxo, esperar o disparo real
      acontecer (usar `* * * * *` pra não esperar muito) e conferir a
      execução na tela de Execuções — o `triggerType` aparece como
      esperado e o resultado do node final está correto?
- [ ] Desabilitar o agendamento (ou arquivar o fluxo) enquanto ele está
      ativo — confirmar que ele realmente para de disparar (esperar pelo
      menos 2 minutos sem ver nenhuma execução nova — valida fix A2, que
      antes deixava o cron rodando pra sempre após arquivar).

## Notas técnicas conhecidas (não são bugs pra reportar de novo)

- **A busca global não tem indicador de carregamento** — entre digitar e o
  resultado aparecer (debounce de 250ms + round-trip da API) a lista fica
  vazia sem nenhum spinner. É uma decisão de produto, não um bug.
- **A mensagem de erro de expressão cron inválida não é traduzida** — é
  sempre um prefixo fixo em português concatenado com a mensagem (em inglês)
  da lib `cron-parser` (ex.: "Expressao cron invalida: Constraint error, got
  value 60 expected range 0-59"), mesmo com o idioma da interface em inglês.
- **O primeiro disparo de um cron recém-habilitado pode demorar até ~1
  minuto** (alinhado ao próximo minuto cheio, mais o tempo de processamento
  da fila) — não é bug se não disparar instantaneamente ao salvar.

## O que anotar se algo falhar

Pra cada item que falhar: o que você esperava vs. o que aconteceu, browser +
versão, e se reproduz de novo repetindo o passo. Isso vira ponto de partida
pra investigação, não precisa já vir com causa raiz.
