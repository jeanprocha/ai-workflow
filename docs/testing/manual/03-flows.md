# Roteiro manual — Fase 03: Flows (lista)

Complementa `tests/flows/*.spec.ts` (automatizado). Aqui é o que exige olho
humano: visual, sensação, comportamento entre abas, integração com o browser.
Rode local (http://localhost:3000/flows) a menos que a seção diga "produção".
O editor (canvas) tem roteiro próprio na Fase 04.

## Lista de fluxos (`/flows`)

- [ ] Tema escuro e claro: cards, badges de status (Rascunho cinza, Ativo
      verde, Arquivado apagado) e o menu de três pontos legíveis nos dois.
- [ ] Criar uns 7+ fluxos e ver o grid reorganizar em 1/2/3 colunas conforme
      a largura da janela — sem card cortado nem espaçamento estranho.
- [ ] Largura de celular (~375px): cards em coluna única, menu de três pontos
      alcançável, botões do topo ("Gerar com IA" / "Criar fluxo") não quebram.
- [ ] Passar o mouse num card: hover destaca a borda; clicar em qualquer área
      do card (fora do menu) navega pro editor.
- [ ] Abrir o menu de um card e navegar pelas opções por teclado (setas +
      Enter) — foco visível em cada item.
- [ ] Arquivar um fluxo e conferir que ele CONTINUA na lista (não há filtro
      hoje) — julgar se isso incomoda com muitos fluxos; anotar impressão.

## Criação

- [ ] "Criar fluxo": digitar o nome e apertar Enter — hoje NÃO submete (só o
      clique no botão). Anotar se isso incomodar.
- [ ] Criar fluxo com nome bem longo (80+ caracteres) — card não deve quebrar
      o layout; conferir como o nome trunca.
- [ ] "Gerar com IA" SEM credencial cadastrada: o aviso apontando pra
      Configuracoes → Credenciais aparece; trocar provider pra ollama faz o
      campo de credencial sumir.
- [ ] (Custa tokens — opcional) Com uma credencial real: gerar um fluxo com
      um prompt simples, revisar o preview (contagem de nodes), "Aceitar e
      criar fluxo" e conferir que cai no editor com o grafo montado.
- [ ] Em `/templates`: usar um template e sentir a latência até cair no
      editor — deve parecer imediato.

## Sessão / integração

- [ ] Duas abas em /flows: renomear um fluxo numa aba e recarregar a outra —
      o nome novo aparece.
- [ ] Excluir um fluxo que já tem execuções (rodar antes pelo editor) — a
      exclusão funciona e o dialog fecha sozinho depois de confirmar.

## Smoke em produção (fazer só depois que tudo acima passar localmente)

Ambiente: `https://web-nine-beige-85.vercel.app` (frontend) +
`https://api-production-cb36.up.railway.app` (API).

- [ ] Criar um fluxo do zero, renomear, arquivar, excluir.
- [ ] Usar um template e conferir que abre o editor com o grafo.

Não repita este smoke a cada mudança pequena — só antes/depois de um deploy
real, pra confirmar que produção está saudável.

## O que anotar se algo falhar

Pra cada item que falhar: o que você esperava vs. o que aconteceu, browser +
versão, e se reproduz de novo repetindo o passo. Isso vira ponto de partida
pra investigação, não precisa já vir com causa raiz.
