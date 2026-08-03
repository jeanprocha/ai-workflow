-- `prisma migrate diff` incluiu, de novo, o mesmo drift espurio de
-- `DROP INDEX "chunks_embedding_hnsw_idx"` documentado acima do model Chunk
-- em schema.prisma (ja aconteceu com password_reset_tokens,
-- workspace_alert_settings, workflow_api_keys, workflow_error_workflow,
-- execution_pause e execution_approvals). Removido antes de aplicar.

-- AlterTable
ALTER TABLE "approvals" ADD COLUMN     "previous_token_hashes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "approvals_previous_token_hashes_idx" ON "approvals" USING GIN ("previous_token_hashes");
