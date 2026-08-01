-- `prisma migrate diff` incluiu, de novo, o mesmo drift espurio de
-- `DROP INDEX "chunks_embedding_hnsw_idx"` documentado acima do model Chunk
-- em schema.prisma (ja aconteceu com password_reset_tokens,
-- workspace_alert_settings, workflow_api_keys, workflow_error_workflow e
-- execution_pause). Removido antes de aplicar.

-- CreateEnum
CREATE TYPE "ApprovalDecisionValue" AS ENUM ('approved', 'rejected', 'void');

-- CreateEnum
CREATE TYPE "ApprovalTimeoutAction" AS ENUM ('approve', 'reject');

-- CreateTable
CREATE TABLE "approvals" (
    "id" TEXT NOT NULL,
    "execution_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "on_timeout" "ApprovalTimeoutAction" NOT NULL DEFAULT 'reject',
    "decided_at" TIMESTAMP(3),
    "decision" "ApprovalDecisionValue",
    "decided_by" TEXT,
    "comment" TEXT,
    "resume_enqueued_at" TIMESTAMP(3),
    "resume_attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "approvals_token_hash_key" ON "approvals"("token_hash");

-- CreateIndex
CREATE INDEX "approvals_workspace_id_decided_at_idx" ON "approvals"("workspace_id", "decided_at");

-- CreateIndex
CREATE INDEX "approvals_decided_at_expires_at_idx" ON "approvals"("decided_at", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "approvals_execution_id_node_id_key" ON "approvals"("execution_id", "node_id");

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
