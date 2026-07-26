# Roteiro manual — Fase 06: Agents

Complementa `tests/agents/*.spec.ts` (automatizado — CRUD, ferramentas,
validações, isolamento por workspace, e o chat no caminho de erro). Aqui é o
que exige olho humano e, sobretudo, **IA de verdade**: a suíte automatizada
cobre o chat só até o erro de credencial, porque cada resposta real gasta
tokens. Rode local (http://localhost:3000/agents) a menos que a seção diga
"produção". Não precisa do worker (o chat do agente é síncrono, dentro do
próprio request).

## Lista e criação

- [ ] Criar 4-5 agentes com combinações diferentes de ferramentas e conferir o
      grid: cards alinhados, nomes longos não estouram o card, descrição longa
      não empurra o botão "Testar" pra fora.
- [ ] Card sem descrição vs. card com descrição — a altura desigual entre eles
      no mesmo grid incomoda? (O botão "Testar" usa `mt-auto` pra alinhar no
      rodapé; confirmar que funciona.)
- [ ] Um agente com muitas ferramentas marcadas (todas as 5) — os chips
      quebram em várias linhas de forma legível?
- [ ] Tema claro e escuro: contraste dos chips de ferramenta (texto primary em
      fundo accent-subtle costuma ser o mais apertado), do ícone do robô e da
      linha mono `provider · modelo`.
- [ ] Largura de celular (~375px): o grid vira 1 coluna; o dialog de criação
      (que tem scroll interno, `max-h-[60vh]`) é usável com teclado virtual
      aberto?
- [ ] Testar Tab pelo formulário de criação — ordem lógica, foco visível,
      checkboxes alcançáveis e marcáveis com Espaço.

## Chat de teste (precisa de credencial de IA real)

Pré-requisito: uma conexão de IA válida cadastrada em Settings, e um agente
apontando pra ela pelo nome no campo "Conexao (credential)".

- [ ] Enviar uma pergunta simples e julgar a resposta: o system prompt foi
      respeitado? O tom/formato pedidos aparecem?
- [ ] Sentir a latência: sem streaming, a tela fica só com "Enviando..." até a
      resposta inteira chegar. Numa resposta longa isso passa a sensação de
      travado? Anotar a impressão — é o candidato natural a streaming depois.
- [ ] Criar um agente com a ferramenta **Calculator** e pedir uma conta que
      exija usá-la ("quanto é 1234 * 5678?") — a resposta usa a ferramenta
      (número exato) ou o modelo "chuta" de cabeça?
- [ ] Criar um agente com **Memoria persistente**, pedir pra ele guardar algo
      ("lembre que meu nome é X"), **fechar o dialog**, reabrir e perguntar o
      que ele guardou. A memória sobrevive entre conversas? (Não há tela pra
      inspecionar memória — este teste é a única forma de verificar.)
- [ ] Mandar duas perguntas seguidas no mesmo dialog e conferir que a segunda
      resposta **substitui** a primeira na tela (não há histórico visível — a
      UI mostra só a última resposta). Isso é confuso? Anotar.
- [ ] Agente com **Internet (HTTP)** e uma pergunta que exija buscar algo
      externo — funciona? A resposta indica que a ferramenta foi usada?
- [ ] Agente com **Knowledge Base** apontando pra uma base com documentos
      ingeridos (depende da Fase 07) — as respostas citam o conteúdo da base?

## Exclusão

- [ ] Excluir um agente que está sendo usado por um fluxo (node Agent) e
      depois abrir/executar esse fluxo — a mensagem de erro deixa claro o que
      aconteceu? O aviso no dialog de exclusão preparou você pra isso?

## Notas técnicas conhecidas (não são bugs pra reportar de novo)

- **Não existe edição pela UI.** A API tem `PATCH /agents/:id`, mas a tela só
  cria, lista, exclui e testa. Pra mudar o system prompt de um agente hoje é
  preciso excluir e recriar.
- **Não existe tela de memória.** O checkbox "Memoria persistente" só liga as
  ferramentas `memory_get`/`memory_set`; não há como listar nem limpar o que o
  agente memorizou pela interface.
- **Temperature não tem campo no formulário** — fica fixa em `0.7` para todo
  agente criado pela UI (só é ajustável via API).
- O `h1` da página é **"Agents"** (em inglês, mesmo com a interface em pt),
  enquanto o link do menu é "Agentes".
- O botão "X" de fechar dos dialogs tem nome acessível **"Close"** (hardcoded
  no componente compartilhado de dialog — mudar afeta todas as telas).
- **Nomes duplicados são permitidos**: dois agentes com o mesmo nome no mesmo
  workspace são aceitos, e os cards ficam indistinguíveis. Diferente de
  Conexões, que tem unique de nome.
- A validação do formulário é um **no-op silencioso**: com Nome ou System
  prompt vazios o botão não faz nada — sem toast, sem erro embaixo do campo.
- Ferramenta inexistente configurada via API é aceita e simplesmente ignorada
  na hora do chat (nunca é oferecida ao modelo).

## Smoke em produção (fazer só depois que tudo acima passar localmente)

Ambiente: `https://web-nine-beige-85.vercel.app` (frontend) +
`https://api-production-cb36.up.railway.app` (API).

- [ ] Abrir a lista de Agents e conferir que carrega.
- [ ] Testar um agente existente com uma pergunta curta (gasta token real).

Não repita este smoke a cada mudança pequena — só antes/depois de um deploy
real, pra confirmar que produção está saudável.

## O que anotar se algo falhar

Pra cada item que falhar: o que você esperava vs. o que aconteceu, browser +
versão, e se reproduz de novo repetindo o passo. Isso vira ponto de partida
pra investigação, não precisa já vir com causa raiz.
