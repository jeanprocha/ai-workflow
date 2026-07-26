# Roteiro manual — Fase 10: IA de plataforma (Autocomplete, Copilot, AI Debugger, Cost Optimizer)

Complementa `tests/platform-ai/*.spec.ts` (automatizado — 26 caminhos de
erro/validação determinísticos das 4 features, sem gastar nenhum token, mais
3 testes `@ai` com credencial real que rodam só sob demanda com
`playwright test --grep @ai`). Aqui é o que só dá pra julgar com **respostas
reais de LLM**: qualidade do grafo gerado, se o diagnóstico acerta a causa,
se o Copilot entende o fluxo de verdade. Rode local a menos que a seção diga
"produção". Precisa de uma credencial de IA válida cadastrada em Settings.

## Autocomplete ("Gerar com IA" em /flows)

- [ ] Descrever um fluxo com 3-4 passos claros (ex.: "quando chegar um email
      com anexo PDF, extraia o texto, resuma com IA e envie o resumo no
      Slack") e conferir o grafo gerado: os nodes fazem sentido pro que foi
      pedido? A ordem das conexões está certa?
- [ ] Descrever algo vago ou contraditório — o resultado degrada bem (grafo
      mais simples, ou erro claro) ou produz algo sem sentido?
- [ ] "Gerar de novo" depois de um resultado ruim — o novo resultado muda de
      verdade, ou fica preso na mesma resposta?
- [ ] Aceitar um fluxo gerado e abrir no editor — o autosave, a paleta de
      nodes, tudo funciona normalmente com um grafo que veio de fora (não
      criado manualmente)?

## Copilot (dentro do editor)

- [ ] Abrir um fluxo com alguns nodes reais e perguntar "Existe um
      gargalo?" — a resposta faz referência a nodes específicos do fluxo
      (nomes, tipos) ou é genérica?
- [ ] Usar os chips de sugestão ("Como melhorar este fluxo?" etc.) — cada um
      dispara a pergunta na hora, sem precisar digitar. Sentir se isso é
      descoberto intuitivamente (os chips têm destaque suficiente?).
- [ ] Pedir uma mudança concreta ("adicione um node de log no final") e
      conferir se aparece o botão "Aplicar mudanca no grafo" — clicar e ver
      se o grafo realmente mudou como pedido depois do reload.
- [ ] Conversar em sequência (2-3 mensagens) — o histórico é levado em conta
      nas respostas seguintes?
- [ ] Sentir a latência: sem indicador de "digitando", só o botão de enviar
      fica desabilitado. Numa resposta longa isso parece travado?

## AI Debugger (em uma execução falhada)

- [ ] Provocar uma falha real e específica (ex.: URL inválida num HTTP
      Request, JSON malformado num node) e conferir se a "causa provável"
      identifica corretamente o que aconteceu.
- [ ] Aplicar uma sugestão de "Adicionar Retry" ou "Aumentar Timeout" e
      depois abrir o editor — confirmar que a config do node mudou do jeito
      esperado (nova versão do fluxo salva).
- [ ] Testar num node que já tem uma config mais elaborada — as sugestões
      continuam fazendo sentido, ou tentam mudar algo que não deveria?

## Cost Optimizer (caminho com sugestão real)

- [ ] Rodar um fluxo com node de IA (ex.: `claude-sonnet-5`) pelo menos 3
      vezes nos últimos 30 dias, depois ir em `/cost-optimizer` e clicar
      "Analisar" — confirmar que a sugestão de troca por um modelo mais
      barato aparece com o label human do node certo (não mais "node n2" —
      valida o fix A2 desta fase).
- [ ] Aplicar a sugestão e abrir o fluxo — o node realmente mudou pro
      modelo/provider sugerido?

## Notas técnicas conhecidas (não são bugs pra reportar de novo)

- **O Copilot pode não retornar uma proposta de mudança no grafo** mesmo
  quando parece que deveria — se a resposta da IA não vier em JSON válido
  no formato esperado, a feature degrada silenciosamente pra só texto (sem
  botão "Aplicar"). Isso é esperado, não reporte como bug isolado; só vale
  atenção se acontecer com muita frequência.
- **Timeout de 30s no frontend**: prompts muito longos ou fluxos com muitos
  nodes podem fazer o Copilot ou o Autocomplete estourarem esse limite antes
  da IA responder — a mensagem que aparece é genérica ("A requisicao demorou
  demais e foi cancelada."), não o erro real.
- **O Cost Optimizer nunca sugere trocar para Ollama** — é uma decisão de
  produto (migrar pra um modelo local é operacionalmente maior que trocar
  de modelo de API), não uma limitação técnica.
- **Analisar o Cost Optimizer duas vezes seguidas duplica as sugestões**
  (cada chamada grava uma linha nova) — não é idempotente.

## Smoke em produção (fazer só depois que tudo acima passar localmente)

Ambiente: `https://web-nine-beige-85.vercel.app` (frontend) +
`https://api-production-cb36.up.railway.app` (API).

- [ ] Testar o Copilot num fluxo real com uma pergunta simples (gasta token
      real).

Não repita este smoke a cada mudança pequena — só antes/depois de um deploy
real, pra confirmar que produção está saudável.

## O que anotar se algo falhar

Pra cada item que falhar: o que você esperava vs. o que aconteceu, browser +
versão, e se reproduz de novo repetindo o passo. Isso vira ponto de partida
pra investigação, não precisa já vir com causa raiz.
