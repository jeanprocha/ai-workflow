# Bases de conhecimento e RAG

> Última revisão: 2026-08-03 · commit `93468bf`

## O que faz

Uma base de conhecimento (KB) é um conjunto de documentos de um workspace transformado em vetores, para que fluxos e agentes possam fazer busca semântica em cima de conteúdo próprio em vez de depender só do que o modelo sabe. É a peça de RAG (retrieval-augmented generation) da plataforma: o usuário sobe PDFs, DOCX, CSVs, TXT ou Markdown; a plataforma extrai o texto, quebra em pedaços, gera embeddings e guarda tudo no Postgres com pgvector. Depois, uma pergunta em linguagem natural vira um embedding e é comparada por distância de cosseno com os pedaços armazenados.

O vocabulário tem três níveis. A **base de conhecimento** é a unidade de configuração: define qual provider e qual modelo de embedding usar, qual credencial do workspace dá acesso a esse provider, e como o texto deve ser fatiado (tamanho do chunk e overlap entre chunks vizinhos). O **documento** é um arquivo enviado, com um ciclo de vida próprio — nasce em `processing`, vira `ready` quando todos os seus chunks foram embeddados, ou `failed` com a mensagem do erro. O **chunk** é um pedaço de texto com seu vetor; é a unidade que a busca devolve.

O caminho do upload tem uma divisão que costuma surpreender: a **extração de texto é síncrona**, dentro da própria requisição HTTP de upload. Se o arquivo não for parseável, ou não tiver texto extraível, o upload é rejeitado na hora com erro de validação e nenhum documento é criado. Só depois de o texto bruto estar guardado é que o trabalho caro — fatiar e gerar embeddings — vai para a fila `ingestion`, processada pelo worker. Ou seja: o usuário descobre imediatamente que o arquivo é inválido, mas descobre de forma assíncrona (pelo status do documento) que a chamada ao provider de embeddings falhou.

A busca é sempre escopada a uma base. O SQL roda direto via `$queryRawUnsafe` porque o Prisma não tem tipo nativo para `vector` — a coluna é declarada como `Unsupported(...)` e todo acesso a ela é SQL bruto. A consulta junta chunks com documentos, filtra por base e por documentos em `ready`, ordena por distância de cosseno e corta em `topK`. O `threshold` é aplicado **depois** do corte, em memória: pedir 5 resultados com threshold alto pode devolver menos de 5, e nunca vai buscar mais fundo na lista para completar.

Há três consumidores da mesma busca. A rota HTTP `POST /knowledge/:id/search` serve a UI e integrações externas. O node `knowledge.search` serve fluxos — quando o campo de query está vazio, ele usa a entrada do node como pergunta. E a tool `knowledge_base` dos agentes serve o loop de tool-calling: um agente com uma KB anexada pode decidir sozinho consultar a base durante a conversa. Node e agente entram por `searchInternal`, que pula a revalidação de workspace porque o chamador já a fez.

## Onde vive

| Arquivo                                                                                       | Papel                                                                         |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `apps/api/src/knowledge/knowledge.controller.ts`                                              | Rotas HTTP de KB, documentos e busca; limite de 20 MB por upload.             |
| `apps/api/src/knowledge/knowledge.service.ts`                                                 | CRUD, upload, `ingest` (chunk + embed + insert) e as duas variantes de busca. |
| `apps/api/src/knowledge/ingestion.processor.ts`                                               | Consumidor da fila `ingestion`; só chama `ingest` e emite telemetria de job.  |
| `apps/api/src/knowledge/chunking.ts`                                                          | Fatiamento por caracteres, com ajuste para quebrar em espaço ou nova linha.   |
| `apps/api/src/knowledge/vector-utils.ts`                                                      | Serializa `number[]` no literal `[a,b,c]` que o pgvector aceita.              |
| `packages/nodes/src/text-extraction.ts`                                                       | Infere o tipo do arquivo e extrai texto de pdf/docx/csv/txt/md.               |
| `packages/nodes/src/definitions/knowledge-search.ts`                                          | Definição do node `knowledge.search`.                                         |
| `apps/api/src/agents/tools.ts`                                                                | Tool `knowledge_base` dos agentes, que chama `searchInternal`.                |
| `apps/api/prisma/migrations/20260724030000_knowledge_rag/migration.sql`                       | Migration original: tabelas e criação do índice HNSW.                         |
| `apps/api/prisma/migrations/20260727180000_restore_chunks_embedding_hnsw_index/migration.sql` | Recria o índice HNSW derrubado por drift; o cabeçalho documenta a causa raiz. |

**Rotas da API**

| Rota                                          | O que faz                                                              |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| `GET /knowledge`                              | Lista as bases do workspace com a contagem de documentos.              |
| `POST /knowledge`                             | Cria uma base (provider, modelo, credencial, chunkSize, overlap).      |
| `DELETE /knowledge/:id`                       | Remove a base; documentos e chunks caem por cascade.                   |
| `GET /knowledge/:id/documents`                | Lista documentos com status, erro e número de chunks.                  |
| `POST /knowledge/:id/documents`               | Upload multipart no campo `file`; extrai texto e enfileira a ingestão. |
| `DELETE /knowledge/:id/documents/:documentId` | Remove um documento e seus chunks.                                     |
| `POST /knowledge/:id/search`                  | Busca semântica (`query`, `topK`, `threshold`).                        |

**Páginas web**

| Página            | O que faz                                                            |
| ----------------- | -------------------------------------------------------------------- |
| `/knowledge`      | Lista, cria e apaga bases.                                           |
| `/knowledge/[id]` | Documentos de uma base: upload, status de ingestão e busca de teste. |

**Models Prisma** (`apps/api/prisma/schema.prisma`)

| Model           | Uma linha                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| `KnowledgeBase` | Configuração da base: provider, modelo de embedding, credencial, `chunkSize`, `chunkOverlap`.            |
| `Document`      | Arquivo enviado: `sourceType`, status (`processing`/`ready`/`failed`), `error`, `chunkCount`, `rawText`. |
| `Chunk`         | Pedaço de texto + `embedding Unsupported("vector(1536)")` + `metadata` opcional.                         |

**Filas BullMQ**

| Fila        | O que processa                                                                                                              |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| `ingestion` | Um job por documento: chunking, embedding em lote e insert dos chunks. Concorrência via `INGESTION_CONCURRENCY` (padrão 2). |

## Como se conecta

- Depende de [Auth e workspaces](12-auth-workspaces.md): toda rota passa pelo `WorkspaceGuard`, e a chave do provider de embeddings é resolvida a partir de uma credencial do workspace, descriptografada na hora do uso.
- É consumido pelo [Catálogo de nodes](03-nodes-catalogo.md) através de `knowledge.search`, que a [Engine de execução](01-engine-execucao.md) atende expondo um callback `searchKnowledge` no contexto do node (o node roda em worker thread e chega ao serviço por RPC).
- É consumido por [Agents](08-agents.md): a KB anexada ao agente vira a tool `knowledge_base` no loop de tool-calling.
- A ingestão roda no worker separado, não na API — ver [Observabilidade e deploy](14-observabilidade-deploy.md).

## Decisões e histórico

- [ADR-002](../adr/002-vector-db-pgvector.md) — por que pgvector no mesmo Postgres em vez de um vector DB dedicado, e a expectativa de que trocar depois não toque nos consumidores.
- [ADR-001](../adr/001-orm-prisma.md) — o Prisma como ORM, que é o motivo de a coluna de embedding ser `Unsupported` e de todo acesso vetorial ser SQL bruto.
- [ADR-008](../adr/008-worker-separado.md) — por que a fila `ingestion` é consumida por um processo separado da API.
- [base-evolucao.md](../produto/base-evolucao.md) §3.3 — registra chunking por caracteres sem tokenizer e embeddings Gemini sem batch como pontos a refinar.
- Não há ADR específico sobre a estratégia de chunking nem sobre a escolha de `text-embedding-3-small` como padrão; ambos foram decisões de implementação.

## Limitações e fora de escopo

- **Armadilha do índice HNSW.** `chunks.embedding` é `Unsupported("vector(1536)")`, então o Prisma não consegue representar `chunks_embedding_hnsw_idx` no schema e trata o índice como drift: **qualquer** `prisma migrate dev`/`migrate diff` novo gera um `DROP INDEX "chunks_embedding_hnsw_idx"` automático no topo do arquivo. Isso já aconteceu duas vezes de fato (`20260725193432_ai_suggestion_telemetry` e `20260728234853_execution_step_vars_patch`) e a primeira passou despercebida até a migration de restauração. Regra prática: gerar toda migration nova com `--create-only`, abrir o `migration.sql` e remover o `DROP INDEX` antes de aplicar — as migrations a partir de `20260730023258` trazem um comentário no topo registrando que o DROP espúrio foi removido à mão. Se o DROP escapar, a busca continua funcionando (o pgvector aceita a query sem índice), só que com varredura sequencial — a falha é silenciosa e só aparece como lentidão.
- **Criar o índice em produção toma lock de escrita** na tabela `chunks`; `CREATE INDEX CONCURRENTLY` não roda dentro da transação do `migrate deploy`. Em volume grande, criar manualmente antes do deploy (o `IF NOT EXISTS` faz o migrate só confirmar).
- **Dimensão fixa em 1536.** A coluna é `vector(1536)`; qualquer modelo de embedding com outra dimensionalidade quebra o insert. Não há validação disso na criação da base.
- **Não há reprocessamento.** `rawText` é guardado para isso, mas não existe rota de reingestão: mudar `chunkSize`, `chunkOverlap` ou o modelo de embedding não afeta documentos já processados, e não há como reaproveitar chunks entre modelos diferentes. O caminho atual é apagar e subir de novo.
- **Ingestão não é transacional nem retentável por partes.** Os chunks são inseridos um a um em loop; se a chamada de embedding falhar no meio, o documento vai para `failed` mas os chunks já inseridos permanecem.
- **Chunking é por caracteres, sem tokenizer**, e não há hybrid search (BM25/keyword) nem reranking — só similaridade vetorial pura.
- **`threshold` filtra depois do `topK`**, então pode devolver menos resultados do que o pedido sem buscar mais fundo.
- **`Chunk.metadata` existe no schema e é devolvido pela busca, mas nunca é preenchido** pela ingestão — não há metadados por página, seção ou posição no documento.
- **Anthropic não serve embeddings**: o provider lança erro explícito. As opções reais são OpenAI, Gemini e Ollama. Em Gemini a geração é um request por texto (sem batch) e o custo é contabilizado como zero.
- **Sem particionamento nem paginação de resultados**: `topK` é limitado a 20 no node, e a busca não expõe cursor.
