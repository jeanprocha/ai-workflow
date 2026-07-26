# Roteiro manual — Fase 04: Editor

Complementa `tests/editor/*.spec.ts` (automatizado). Aqui é o que exige olho
humano: fluidez do canvas, sensação de arrastar/soltar, zoom/pan, tema,
mobile. Rode local (http://localhost:3000/flows/[id]) a menos que a seção
diga "produção". É a tela mais complexa da plataforma — reserve mais tempo
que nas fases anteriores.

## Canvas e paleta

- [ ] Arrastar um node de verdade (mouse) da paleta até o canvas — sensação
      de "peso" do drag, cursor muda pra grabbing, o node solta exatamente
      onde o mouse largou (não alguns pixels de distância).
- [ ] Zoom in/out pelos controles e pela roda do mouse; "Fit View" (ícone de
      enquadrar) centraliza todos os nodes na tela.
- [ ] Arrastar o canvas vazio (pan) com o mouse — suave, sem travar.
- [ ] Minimap (canto inferior direito): clicar nele navega pra aquela área
      do canvas; nodes aparecem lá como retângulos proporcionais.
- [ ] Criar uns 15+ nodes espalhados e testar a fluidez (arrastar, conectar,
      selecionar) — sentir se fica pesado/travado.
- [ ] Arrastar um node por cima de outro nodes — não deve "grudar" nem
      quebrar as edges existentes.
- [ ] Largura de celular (~375px): o editor é usável (mesmo que apertado)?
      Anotar a impressão — hoje não há layout mobile dedicado.
- [ ] Tema claro e escuro: contraste dos nodes, das edges (linhas finas
      claras em fundo claro podem sumir), do minimap, dos pontinhos de fundo.

## Painel de configuração

- [ ] Selecionar nodes de tipos diferentes (HTTP Request, If, Cron, um
      node de IA) e conferir que os campos fazem sentido visualmente —
      nenhum campo cortado, textarea de JSON com fonte monoespaçada legível.
- [ ] Alternar entre selecionar node A → node B rapidamente — o painel troca
      de conteúdo sem piscar/misturar campos do node anterior.
- [ ] No node Cron: trocar o preset, editar a expressão manualmente, clicar
      "Calcular próximas execuções" e conferir se as datas fazem sentido.
- [ ] Testar Tab pelos campos do painel — ordem lógica, foco visível.

## Execução ao vivo

- [ ] Rodar um fluxo com alguns nodes e observar o canvas: cada node deve
      "acender" (pulsar) durante a execução e mostrar check verde ou X
      vermelho ao terminar — sentir se o timing parece certo (não muito
      rápido pra perceber, não travado).
- [ ] Rodar um fluxo que vai falhar de propósito (ex.: HTTP Request pra uma
      URL inválida) e conferir o X vermelho no node certo.
- [ ] Deixar a aba em segundo plano durante uma execução longa e voltar —
      o status deve ter continuado atualizando (SSE não deve cair só por
      trocar de aba).

## Histórico de versões

- [ ] Fazer 4-5 edições espaçadas, abrir "Histórico" e conferir que as
      datas/horários fazem sentido e estão em ordem.
- [ ] "Ver diff" numa versão com bastante diferença — a lista de +/-/~
      é fácil de entender visualmente (cores certas: verde adição, vermelho
      remoção)?
- [ ] Restaurar uma versão antiga e sentir a transição (a página recarrega
      por inteiro) — não é o ideal em termos de UX; anotar se incomoda.

## Sessão / integração

- [ ] Editar um fluxo em duas abas ao mesmo tempo — a segunda aba não sabe
      da primeira (sem colaboração em tempo real); confirmar que não corrompe
      nada, só que uma sobrescreve a outra na próxima autosave.
- [ ] Fechar a aba logo depois de uma edição (antes de "Salvo" aparecer) e
      reabrir o fluxo — a edição foi perdida (comportamento esperado, sem
      aviso de "alterações não salvas" ao sair — ver nota abaixo).

## Notas técnicas conhecidas (não são bugs pra reportar de novo)

- Só dá pra adicionar node por arrastar da paleta — não há clique nem atalho
  de teclado.
- Deletar um node selecionado é com **Backspace**, não Delete.
- Não existe confirmação/aviso ao sair da página com edição pendente
  (sem "beforeunload").

## Smoke em produção (fazer só depois que tudo acima passar localmente)

Ambiente: `https://web-nine-beige-85.vercel.app` (frontend) +
`https://api-production-cb36.up.railway.app` (API).

- [ ] Abrir um fluxo existente, arrastar um node, conferir "Salvo".
- [ ] Rodar o fluxo e ver o status ao vivo no canvas.

Não repita este smoke a cada mudança pequena — só antes/depois de um deploy
real, pra confirmar que produção está saudável.

## O que anotar se algo falhar

Pra cada item que falhar: o que você esperava vs. o que aconteceu, browser +
versão, e se reproduz de novo repetindo o passo. Isso vira ponto de partida
pra investigação, não precisa já vir com causa raiz.
