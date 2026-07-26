# Roteiro manual — Fase 02: Settings

Complementa `tests/settings/*.spec.ts` (automatizado). Aqui é o que exige olho
humano: visual, sensação, comportamento entre abas, integração com o browser.
Rode local (http://localhost:3000/settings) a menos que a seção diga "produção".

## Preferências

- [ ] Alternar tema escuro ↔ claro pelo botão no topo da seção — a página
      inteira troca na hora (cards, dialogs abertos, toasts), sem flash nem
      elemento que ficou "preso" no tema antigo.
- [ ] Trocar idioma pra English e voltar pra Português — títulos, botões e
      textos das três seções trocam; recarregar a página mantém a escolha.

## Conexões (credenciais)

- [ ] Abrir o dialog "Adicionar conexao" e navegar só por teclado: Tab passa
      por Provider → Nome → Chave/valor → Cancelar → Adicionar, foco visível
      em cada parada; Esc fecha o dialog.
- [ ] O gerenciador de senha do browser NÃO deve oferecer salvar senha ao
      digitar no campo "Chave / valor" (é um campo de API key, não de login).
      Se oferecer, anotar — é chato mas conhecido em campos type=password.
- [ ] Criar uma conexão e conferir a linha: nome legível, `provider · ••••XXXX`
      em fonte mono, lixeira alinhada à direita — nos dois temas.
- [ ] Largura de celular (~375px): as linhas da lista não quebram feio, o
      dialog cabe na tela e os botões continuam alcançáveis.
- [ ] Deletar uma conexão e sentir a latência: o dialog de confirmação fecha
      só depois da resposta do servidor — deve parecer imediato em local.
- [ ] Criar ~10 conexões e ver se a lista continua legível (não há paginação
      hoje — é lista corrida; anotar se ficar ruim).

## Variáveis

- [ ] Mesmos itens de teclado/tema/mobile do dialog de conexões.
- [ ] Marcar "Tratar como secret" e ver o campo Valor virar bolinhas na hora,
      enquanto se digita.
- [ ] Depois de criar uma secret, confirmar que não existe NENHUM jeito de ver
      o valor de novo pela UI (nem tooltip, nem inspecionar a linha).
- [ ] Criar uma variável com valor bem longo (200+ caracteres) — a linha da
      lista não deve empurrar a lixeira pra fora nem quebrar o layout.

## Sessão / integração

- [ ] Com duas abas abertas em /settings, criar uma conexão numa aba e
      recarregar a outra — a nova conexão aparece (mesmo workspace).
- [ ] Ficar com o dialog aberto por 15+ minutos (access token expira) e então
      submeter — deve funcionar sem pedir login (refresh silencioso).

## Smoke em produção (fazer só depois que tudo acima passar localmente)

Ambiente: `https://web-nine-beige-85.vercel.app` (frontend) +
`https://api-production-cb36.up.railway.app` (API).

- [ ] Criar uma conexão de teste (valor fake), conferir a máscara na lista,
      deletar em seguida.
- [ ] Criar e deletar uma variável não-secret.

Não repita este smoke a cada mudança pequena — só antes/depois de um deploy
real, pra confirmar que produção está saudável.

## O que anotar se algo falhar

Pra cada item que falhar: o que você esperava vs. o que aconteceu, browser +
versão, e se reproduz de novo repetindo o passo. Isso vira ponto de partida
pra investigação, não precisa já vir com causa raiz.
