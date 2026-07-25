-- DropIndex
DROP INDEX "chunks_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "ai_suggestions" ADD COLUMN     "cost_usd" DOUBLE PRECISION,
ADD COLUMN     "input_tokens" INTEGER,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "output_tokens" INTEGER;
