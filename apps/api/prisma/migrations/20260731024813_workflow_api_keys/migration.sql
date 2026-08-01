-- `prisma migrate diff` incluiu, de novo, o mesmo drift espurio de
-- `DROP INDEX "chunks_embedding_hnsw_idx"` documentado acima do model Chunk
-- em schema.prisma (ja aconteceu com password_reset_tokens e
-- workspace_alert_settings). Removido antes de aplicar.

-- CreateTable
CREATE TABLE "workflow_api_keys" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "last_four" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "workflow_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workflow_api_keys_key_hash_key" ON "workflow_api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "workflow_api_keys_workflow_id_idx" ON "workflow_api_keys"("workflow_id");

-- AddForeignKey
ALTER TABLE "workflow_api_keys" ADD CONSTRAINT "workflow_api_keys_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
