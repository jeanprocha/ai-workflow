-- DropIndex
DROP INDEX "chunks_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "credentials" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "execution_steps" ADD COLUMN     "vars_patch" JSONB;

-- Recria o indice HNSW de busca vetorial dropado pela migration diff acima.
--
-- `chunks.embedding` e Unsupported("vector(1536)") no schema.prisma (o
-- Prisma nao tem tipo nativo pra pgvector), entao ele tambem nao representa
-- o indice HNSW em cima dela — TODO `prisma migrate dev` novo enxerga esse
-- indice como "drift" e gera um DROP INDEX automatico (ver
-- 20260727180000_restore_chunks_embedding_hnsw_index/migration.sql, que ja
-- documentou e corrigiu o mesmo problema uma vez). `IF NOT EXISTS` mantem
-- isso seguro se um dev ja tiver recriado manualmente antes de aplicar.
CREATE INDEX IF NOT EXISTS "chunks_embedding_hnsw_idx" ON "chunks" USING hnsw ("embedding" vector_cosine_ops);
