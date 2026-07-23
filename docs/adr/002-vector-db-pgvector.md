# ADR-002: pgvector no PostgreSQL como vector store

Status: Aceito
Data: 2026-07-23

## Contexto

A Fase 7 (Knowledge/RAG) precisa armazenar embeddings e fazer busca por similaridade. Um vector DB dedicado (Qdrant, Pinecone, Weaviate) adiciona mais um serviço de infraestrutura para operar, versionar e monitorar.

## Decisão

Usar a extensão **pgvector** no mesmo PostgreSQL que já serve o resto da aplicação. A tabela `chunks` guarda `embedding vector(N)` e usa índice `ivfflat`/`hnsw` para busca por similaridade.

## Alternativas consideradas

- **Qdrant/Pinecone/Weaviate dedicados**: melhor performance em escala muito grande e features nativas de RAG, mas custo operacional e mais um ponto de falha desde o v1 — prematuro para o estágio atual.
- **Embeddings em memória/arquivo**: inviável para múltiplos workspaces e persistência confiável.

## Consequências

- Menos infraestrutura para operar em dev e nos primeiros ambientes de produção (um único Postgres).
- Interface de retrieval em `packages/ai` é abstraída da implementação de storage — se a escala exigir, a troca por um vector DB dedicado não deve tocar nos consumidores (agentes, node de Knowledge Search).
- Requer imagem Docker com a extensão (`pgvector/pgvector:pg16`) tanto em dev quanto em produção.
