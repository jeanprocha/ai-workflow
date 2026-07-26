# Roteiro manual — Fase 09: Dashboard / Analytics / Cost Optimizer

Complementa `tests/analytics/*.spec.ts` (automatizado — cards, gráficos,
tabela de recentes, cost-optimizer determinístico, isolamento por workspace).
Aqui é o que exige olho humano: os gráficos são SVG artesanal (sem lib), e o
Cost Optimizer com sugestão real só aparece com volume de execuções de IA de
verdade. Rode local (http://localhost:3000/dashboard) a menos que a seção
diga "produção". Precisa do worker rodando pra qualquer execução chegar a
"Sucesso"/"Falhou".

## Dashboard e Analytics — visual e cache

- [ ] Rodar uns 10-15 fluxos variados (alguns falhando de propósito) e
      conferir o Dashboard: os 6 cards fazem sentido juntos, a tabela de
      recentes não estoura o layout com nomes de fluxo longos.
- [ ] Ir pra Analytics e olhar os gráficos de linha com um volume real de
      dias — a curva de "Execucoes por dia" e "Falhas por dia" tem uma forma
      que corresponde ao que você rodou? (São SVGs bem simples: uma linha e
      pontos, sem eixo de datas visível — não espere rótulos nos eixos.)
- [ ] Voltar pro Dashboard logo depois de rodar um fluxo novo — o cache do
      backend (30s pro resumo, 10s pras recentes) faz os números ficarem
      "atrasados" por alguns segundos antes de refletir a execução nova.
      Isso incomoda na prática? Vale considerar invalidação mais agressiva
      no futuro?
- [ ] Tema claro e escuro: contraste da linha do gráfico de falhas
      (vermelho) e da barra de custo por provider.
- [ ] Largura de celular (~375px): os cards em grid (2 colunas no mobile)
      ficam legíveis; os gráficos (SVG responsivo) não distorcem.

## Cost Optimizer — caminho com sugestão real (precisa de IA de verdade)

Pré-requisito: um fluxo com um node de IA (`ai.chat`, `ai.extraction` etc.)
rodado pelo menos 3 vezes nos últimos 30 dias usando um modelo que não seja
já o mais barato do tier (ex.: `claude-sonnet-5` em vez de
`claude-haiku-4-5-20251001`).

- [ ] Clicar "Analisar" e conferir se aparece uma sugestão de troca de
      modelo. O texto "Trocar X/Y por A/B" faz sentido? O `-N%` de economia
      estimada parece plausível pro par de modelos sugerido?
- [ ] Clicar "Aplicar" numa sugestão e depois abrir o fluxo no editor —
      confirmar que o node realmente foi atualizado pro modelo sugerido
      (nova versão do fluxo salva).
- [ ] Rodar "Analisar" duas vezes seguidas sem mudar nada — cada clique gera
      uma sugestão nova (não é idempotente); isso duplica cards na tela?
      Incomoda?
- [ ] Testar um fluxo que já usa o modelo mais barato do tier — confirmar
      que ele NÃO aparece como oportunidade (comportamento esperado).

## Notas técnicas conhecidas (não são bugs pra reportar de novo)

- **Cache Redis nos endpoints de Analytics**: resumo (30s), execuções
  recentes (10s), série temporal e custo por provider (60s) — todos por
  workspace. Um F5 logo após rodar um fluxo pode mostrar dados levemente
  desatualizados até o cache expirar.
- **O Cost Optimizer não chama nenhum LLM** — é uma heurística que só olha o
  histórico de execuções (mínimo 3 por node/modelo nos últimos 30 dias). O
  que consome IA de verdade é só a *geração* desses dados (rodar fluxos com
  node de IA), não a análise em si.
- **`h1` da página é "Cost Optimizer"** (em inglês), enquanto o link do menu
  lateral diz "Otimizador de Custo".
- **A tabela de "Execucoes recentes" no Dashboard mostra no máximo 5
  linhas** — é um limite fixo do backend, não configurável.
- **A granularidade dos gráficos de Analytics é por dia** — não há como ver
  execuções agrupadas por hora, e dias sem nenhuma execução simplesmente não
  aparecem no gráfico (sem preenchimento de "zero" nos gaps).
- **`Tempo medio` no Dashboard usa sempre ponto decimal** (`"1.2s"`), mesmo
  com a interface em português — é o único número da tela que não segue o
  separador do locale.

## Smoke em produção (fazer só depois que tudo acima passar localmente)

Ambiente: `https://web-nine-beige-85.vercel.app` (frontend) +
`https://api-production-cb36.up.railway.app` (API).

- [ ] Abrir o Dashboard e o Analytics e conferir que carregam com dados
      reais da produção.

Não repita este smoke a cada mudança pequena — só antes/depois de um deploy
real, pra confirmar que produção está saudável.

## O que anotar se algo falhar

Pra cada item que falhar: o que você esperava vs. o que aconteceu, browser +
versão, e se reproduz de novo repetindo o passo. Isso vira ponto de partida
pra investigação, não precisa já vir com causa raiz.
