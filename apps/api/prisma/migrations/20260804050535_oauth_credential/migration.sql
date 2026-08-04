-- `prisma migrate dev --create-only` incluiu, de novo, o mesmo drift espurio
-- de `DROP INDEX "chunks_embedding_hnsw_idx"` documentado acima do model Chunk
-- em schema.prisma (ja aconteceu com password_reset_tokens,
-- workspace_alert_settings, workflow_api_keys, workflow_error_workflow,
-- execution_pause, execution_approvals e mcp_secrets_encrypted). Removido
-- antes de aplicar.

-- AlterTable
ALTER TABLE "credentials" ADD COLUMN     "oauth_expires_at" TIMESTAMP(3),
ADD COLUMN     "oauth_last_error" TEXT,
ADD COLUMN     "oauth_provider" TEXT,
ADD COLUMN     "oauth_scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "oauth_status" TEXT;

-- CreateTable
CREATE TABLE "oauth_states" (
    "id" TEXT NOT NULL,
    "state_hash" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "credential_name" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oauth_states_state_hash_key" ON "oauth_states"("state_hash");

-- CreateIndex
CREATE INDEX "oauth_states_workspace_id_idx" ON "oauth_states"("workspace_id");

-- AddForeignKey
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
