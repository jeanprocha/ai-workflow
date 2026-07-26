# Roteiro manual — Fase 08: MCP

Complementa `tests/mcp/*.spec.ts` (automatizado — conectar, listar tools,
chamar tool, reconectar, desconectar, remover, isolamento por workspace — tudo
contra um servidor MCP de teste local, `apps/e2e/fixtures/mcp-echo-server.mjs`,
zero dependências). Aqui é o que exige olho humano e, sobretudo, **um servidor
MCP real** (via `npx`, que baixa e roda um pacote de verdade — precisa de rede
e leva alguns segundos no primeiro connect). Rode local
(http://localhost:3000/mcp) a menos que a seção diga "produção". Não precisa
do worker para o fluxo principal (connect/reconnect/disconnect/call são
síncronos); só é relevante se você for observar o health check periódico.

## Conectar um servidor MCP real

- [ ] Preset **Filesystem**: ajustar o argumento `/caminho/permitido` para um
      diretório de verdade no seu disco (ex.: `/tmp`) antes de conectar —
      sentir a latência do primeiro `npx` (baixa o pacote se não estiver em
      cache) até o card virar "Conectado".
- [ ] Depois de conectado, conferir que os nomes das tools que aparecem como
      pills fazem sentido (`read_file`, `list_directory` etc., dependendo da
      versão do `@modelcontextprotocol/server-filesystem`).
- [ ] Preset **GitHub**: sem preencher `GITHUB_PERSONAL_ACCESS_TOKEN`, o que
      acontece? O servidor conecta (retorna tools) mesmo sem token válido, ou
      falha na hora? Anotar o comportamento observado.
- [ ] Tentar um servidor `sse` ou `http` remoto de verdade, se tiver algum
      disponível — o transporte remoto tem alguma diferença perceptível de
      latência/comportamento em relação ao `stdio` local?

## UI e usabilidade

- [ ] Testar Tab pelo formulário de conexão — ordem lógica, foco visível,
      trocar o `<select>` de Transport com o teclado esconde/mostra os campos
      certos sem perder o foco.
- [ ] Conectar 3-4 servidores diferentes e conferir a lista: cards não
      colidem visualmente, o texto de `lastError` (quando existe) não estoura
      o card com mensagens muito longas.
- [ ] Tema claro e escuro: contraste do badge "Erro" (vermelho) e do texto
      mono do `lastError` sobre ele.
- [ ] Largura de celular (~375px): o dialog de conexão (com scroll interno)
      é usável; os botões de ação do card (Reconectar/Desconectar/Remover)
      não ficam apertados demais.

## Health check periódico (precisa do worker rodando)

- [ ] Conectar um servidor real, deixar a aba aberta e **esperar mais de 60
      segundos** — o worker roda o health check nesse intervalo. O status
      continua "Conectado" (comportamento esperado após o fix desta fase,
      que faz uma sondagem de conectividade de verdade em vez de confiar em
      estado de memória entre processos)?
- [ ] Matar manualmente o processo do servidor MCP (se for algo que dá pra
      encerrar por fora, como um servidor remoto que você controla) e esperar
      o próximo tick do health check — o status muda pra "Erro" sozinho, sem
      precisar de nenhuma ação na UI?

## Notas técnicas conhecidas (não são bugs pra reportar de novo)

- **Não existe UI para "chamar tool".** O endpoint `POST
  /mcp/servers/:id/call` só é usado internamente (pela tool `mcp:...` dos
  agentes e pelo node `MCP Tool` do editor, que hoje cai no editor de JSON
  cru — sem select de servidor/tool, sem input estruturado). Testar uma
  chamada manual de tool exige ir pela API diretamente.
- **`connect()` nunca retorna erro HTTP.** Uma falha de handshake (comando
  inexistente, URL fora do ar, etc.) sempre volta como sucesso HTTP (201) com
  o servidor no status "Erro" — o jeito de saber que algo deu errado é olhar
  o card, não confiar cegamente num toast de sucesso genérico.
- **Desconectar não pede confirmação** — diferente de remover, que tem
  alertdialog. O clique no botão "Desconectar" age na hora.
- **As tools continuam listadas depois de desconectar** — só somem se você
  remover o servidor de verdade (ou se reconectar e o novo handshake não
  trouxer mais aquela tool).
- **Chamar uma tool num servidor desconectado reconecta sozinho** — não
  precisa clicar em "Reconectar" antes; a próxima chamada de tool (via
  agente, workflow, ou API direta) reestabelece a conexão por conta própria.
- **Sem validação de formato de URL** no campo URL — qualquer texto passa a
  validação do formulário; só falha no momento do handshake, com uma
  mensagem genérica do parser de URL do Node.
- **Sem edição de servidor** — nome, comando, argumentos etc. só podem ser
  definidos na criação; pra mudar qualquer coisa é preciso remover e
  reconectar.
- **Sem unique de nome** — dois servidores com o mesmo nome são aceitos.
- O botão "X" de fechar do dialog tem nome acessível **"Close"** (hardcoded
  no componente compartilhado de dialog).
- O status "Conectando" é praticamente invisível — o `connect()` só responde
  depois que o handshake termina (seja sucesso ou falha), então a UI nunca
  chega a mostrar esse estado intermediário de verdade.

## Smoke em produção (fazer só depois que tudo acima passar localmente)

Ambiente: `https://web-nine-beige-85.vercel.app` (frontend) +
`https://api-production-cb36.up.railway.app` (API).

- [ ] Abrir a lista de MCP e conferir que carrega.
- [ ] Conectar um servidor `stdio` simples (ex.: preset Filesystem apontando
      pra um diretório do próprio ambiente de produção, se fizer sentido) e
      confirmar que o handshake funciona no ambiente hospedado.

Não repita este smoke a cada mudança pequena — só antes/depois de um deploy
real, pra confirmar que produção está saudável.

## O que anotar se algo falhar

Pra cada item que falhar: o que você esperava vs. o que aconteceu, browser +
versão, e se reproduz de novo repetindo o passo. Isso vira ponto de partida
pra investigação, não precisa já vir com causa raiz.
