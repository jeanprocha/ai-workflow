# Roteiro manual — Fase 01: Auth

Complementa `tests/auth/*.spec.ts` (automatizado). Aqui é o que exige olho
humano: visual, sensação, comportamento entre abas, integração com o browser.
Rode local (http://localhost:3000) a menos que a seção diga "produção".

## Registro (`/register`)

- [ ] Tema escuro (padrão) e claro (toggle em Settings, depois volte a
      `/register`) — campos legíveis, contraste ok, sem elemento cortado.
- [ ] Tab pelo formulário: ordem é Nome → Email → Senha → botão "Criar conta"
      → link "Entrar", sem pular nem repetir campo.
- [ ] Foco visível (contorno/anel) em cada campo ao navegar por teclado.
- [ ] Chrome/Firefox oferecem salvar a senha no gerenciador (o campo tem
      `autoComplete="new-password"`) — confirma que o prompt aparece.
- [ ] Redimensionar a janela pra largura de celular (~375px): formulário não
      quebra, botão não fica cortado, texto do hint "Minimo de 8 caracteres."
      continua legível.
- [ ] Criar uma conta de verdade com um email seu (não descartável) e sentir
      o tempo de resposta — o hash bcrypt custa ~300-400ms, mais a criação de
      workspace; deve parecer "instantâneo o suficiente", não travado.

## Login (`/login`)

- [ ] Mesmos itens de tema/tab/foco/mobile do registro.
- [ ] Gerenciador de senha do browser oferece autofill do email+senha salvos
      no passo anterior.
- [ ] Errar a senha 3x seguidas — nenhum bloqueio/rate-limit aparece (hoje
      não existe; confirmar que não trava a UI, só mostra a mensagem de novo).
- [ ] Colar um email com espaço em branco no início/fim — funciona ou dá erro
      claro (o backend não faz `trim()`).

## Sessão / navegação

- [ ] Logar em duas abas do mesmo browser. Deslogar numa aba (menu do
      usuário → Sair). Voltar pra outra aba e clicar em algo que navegue —
      deve pedir login de novo (o cookie é compartilhado entre abas).
- [ ] Deixar uma aba logada aberta e ociosa por mais de 15 minutos (TTL do
      access token) — ao voltar e navegar, a sessão deve continuar
      funcionando sem pedir login de novo (refresh automático, silencioso).
- [ ] Deslogar e clicar "Voltar" no browser — não deve mostrar página
      autenticada com dados (nem que seja um flash antes de redirecionar).
- [ ] Command palette (Ctrl/Cmd+K) só abre estando logado.

## Smoke em produção (fazer só depois que tudo acima passar localmente)

Ambiente: `https://web-nine-beige-85.vercel.app` (frontend) +
`https://api-production-cb36.up.railway.app` (API).

- [ ] Registrar uma conta real, confirmar redirect pro dashboard.
- [ ] Deslogar, logar de novo com a mesma conta.
- [ ] `GET https://api-production-cb36.up.railway.app/health` responde `ok`.

Não repita este smoke a cada mudança pequena — só antes/depois de um deploy
real, pra confirmar que produção está saudável.

## O que anotar se algo falhar

Pra cada item que falhar: o que você esperava vs. o que aconteceu, browser +
versão, e se reproduz de novo repetindo o passo. Isso vira ponto de partida
pra investigação, não precisa já vir com causa raiz.
