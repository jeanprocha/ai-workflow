-- `prisma migrate diff` incluiu, de novo, o mesmo drift espurio de
-- `DROP INDEX "chunks_embedding_hnsw_idx"` documentado acima do model Chunk
-- em schema.prisma (ja aconteceu com password_reset_tokens,
-- workspace_alert_settings e workflow_api_keys). Removido antes de aplicar.

-- AlterTable
ALTER TABLE "workflows" ADD COLUMN     "error_workflow_id" TEXT;

-- CreateIndex
CREATE INDEX "workflows_error_workflow_id_idx" ON "workflows"("error_workflow_id");

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_error_workflow_id_fkey" FOREIGN KEY ("error_workflow_id") REFERENCES "workflows"("id") ON DELETE SET NULL ON UPDATE CASCADE;
