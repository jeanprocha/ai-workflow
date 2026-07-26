# Roteiro manual — Fase 07: Knowledge

Complementa `tests/knowledge/*.spec.ts` (automatizado — CRUD de base, upload
por tipo de arquivo, o pipeline completo do worker até falhar por falta de
credencial, validações e isolamento por workspace). Aqui é o que exige olho
humano e, sobretudo, **embeddings de verdade**: a suíte automatizada cobre
upload e ingestão só até o erro de credencial, porque gerar embeddings reais
gasta tokens da OpenAI. Rode local (http://localhost:3000/knowledge) a menos
que a seção diga "produção". **Precisa do worker rodando**
(`pnpm --filter @workflow/api dev:worker`) — sem ele todo documento fica
preso em "Processando" pra sempre.

## Lista e criação de base

- [ ] Criar 3-4 bases com nomes/descrições variados e conferir o grid: cards
      alinhados, nome longo não estoura o card, contagem de documentos
      atualiza depois de ir pro detalhe e voltar.
- [ ] Tema claro e escuro: contraste dos pills de status (verde "Pronto",
      vermelho "Falhou", azul "Processando" com o ícone girando).
- [ ] Largura de celular (~375px): grid vira 1 coluna; dialog de criação é
      usável com teclado virtual aberto.
- [ ] Testar Tab pelo formulário de criação — ordem lógica, foco visível.

## Upload e ingestão (precisa de credencial OpenAI real)

Pré-requisito: uma conexão do provider `openai` válida cadastrada em
Settings, referenciada pelo nome no campo "Credencial OpenAI (embeddings)" ao
criar a base.

- [ ] Arrastar um arquivo de verdade (mouse) até a dropzone — sensação do
      drag-over (borda muda de cor), solta e começa a processar.
- [ ] Upload de um PDF real (com texto selecionável, não escaneado) — o texto
      extraído faz sentido? Testar também um PDF **escaneado** (sem camada de
      texto) — deve cair no erro "O arquivo nao contem texto extraivel."
- [ ] Upload de um DOCX real com formatação (títulos, listas, tabelas) — a
      extração de texto perde a estrutura (esperado, é texto puro) mas
      continua legível?
- [ ] Upload de um arquivo grande (perto de 20MB) — sentir o tempo de upload
      e se a barra de progresso (se houver) dá feedback adequado; e um
      arquivo **acima** de 20MB pra confirmar o erro de tamanho.
- [ ] Acompanhar o ciclo completo "Processando" → "Pronto" com vários
      documentos ao mesmo tempo (a fila tem concorrência 2) — a lista
      atualiza sozinha via polling, sem precisar recarregar a página?
- [ ] Upload de um arquivo com extensão enganosa (renomear um `.png` pra
      `.txt`) — confirmar o comportamento documentado abaixo (é lido como
      texto, não é rejeitado).

## Busca semântica (precisa de documentos "Pronto")

- [ ] Fazer 3-4 perguntas relacionadas ao conteúdo real dos documentos e
      julgar a relevância dos resultados — os trechos retornados realmente
      respondem à pergunta?
- [ ] Observar os percentuais de similaridade — resultados relevantes ficam
      visivelmente mais altos que os irrelevantes? Qual a faixa típica?
- [ ] Pergunta sem relação nenhuma com os documentos — os resultados ainda
      aparecem (a busca não tem threshold mínimo por padrão) ou vem vazio?
- [ ] Testar busca logo após um documento novo terminar de processar — o
      conteúdo dele já aparece nos resultados?

## Exclusão

- [ ] Excluir uma base usada por um agente (via tool "Knowledge Base") e
      testar esse agente depois — a mensagem de erro deixa claro o que
      aconteceu?
- [ ] Excluir um documento **enquanto ele ainda está "Processando"** — o job
      na fila lida bem com isso ou aparece algum erro nos logs do worker?

## Notas técnicas conhecidas (não são bugs pra reportar de novo)

- **Não existe validação de extensão no servidor.** O atributo `accept` da
  dropzone é só um filtro do seletor de arquivo — via drag-and-drop qualquer
  arquivo passa. Extensões desconhecidas (`.png`, `.zip` etc.) caem no
  fallback "txt" e são lidas como texto puro; se sobrar algum caractere
  imprimível, o upload é aceito normalmente.
- **Não existe edição de base pela UI nem API.** Não há como trocar o
  provider, modelo, credencial ou chunking depois de criada — só recriar.
- **`chunkSize`/`chunkOverlap` não têm campo no formulário** — ficam fixos
  nos defaults do servidor (1000 / 150), só ajustáveis via API.
- **Base com id inválido**: abrir `/knowledge/<id-que-nao-existe>` deixa o
  título da página como `"..."` para sempre, sem nenhum toast de erro — a
  página não faz `GET /knowledge/:id` (esse endpoint não existe), ela filtra
  a lista completa. UX capenga, mas não é um bug desta fase.
- **`POST /knowledge/:id/search` retorna 201**, não 200 — é uma leitura, mas
  o endpoint não tem `@HttpCode(200)`.
- **Excluir documento não pede confirmação** — diferente de excluir a base
  (que tem alertdialog), o clique na lixeira do documento deleta na hora.
- Só o provider **OpenAI** é aceito para embeddings — Anthropic/Claude não
  tem API de embeddings, e não há suporte a Gemini/Ollama nesta tela (mesmo
  existindo esses providers em outras partes da plataforma).

## Smoke em produção (fazer só depois que tudo acima passar localmente)

Ambiente: `https://web-nine-beige-85.vercel.app` (frontend) +
`https://api-production-cb36.up.railway.app` (API).

- [ ] Abrir a lista de Knowledge e conferir que carrega.
- [ ] Upload de um arquivo pequeno numa base existente e confirmar que chega
      a "Pronto" (gasta tokens de embedding reais).

Não repita este smoke a cada mudança pequena — só antes/depois de um deploy
real, pra confirmar que produção está saudável.

## O que anotar se algo falhar

Pra cada item que falhar: o que você esperava vs. o que aconteceu, browser +
versão, e se reproduz de novo repetindo o passo. Isso vira ponto de partida
pra investigação, não precisa já vir com causa raiz.
