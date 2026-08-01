-- `prisma migrate diff` incluiu, de novo, o mesmo drift espurio de
-- `DROP INDEX "chunks_embedding_hnsw_idx"` documentado acima do model Chunk
-- em schema.prisma (ja aconteceu com password_reset_tokens,
-- workspace_alert_settings, workflow_api_keys e workflow_error_workflow).
-- Removido antes de aplicar.

-- AlterEnum
ALTER TYPE "ExecutionStatus" ADD VALUE 'waiting_approval';

-- AlterTable
ALTER TABLE "executions" ADD COLUMN     "elapsed_ms_before_pause" INTEGER,
ADD COLUMN     "run_started_at" TIMESTAMP(3),
ADD COLUMN     "suspended_at" TIMESTAMP(3);

-- Backfill: toda execucao existente ja teve seu unico "claim" no enqueue
-- inicial, entao run_started_at = started_at pra elas. Novas execucoes (e
-- toda retomada pos-pausa) gravam run_started_at explicitamente na engine.
UPDATE "executions" SET "run_started_at" = "started_at" WHERE "run_started_at" IS NULL;

-- CreateTable
CREATE TABLE "execution_paused_states" (
    "execution_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "state" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "execution_paused_states_pkey" PRIMARY KEY ("execution_id")
);

-- AddForeignKey
ALTER TABLE "execution_paused_states" ADD CONSTRAINT "execution_paused_states_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
