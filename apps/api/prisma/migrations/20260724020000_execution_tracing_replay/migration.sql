-- AlterTable
ALTER TABLE "execution_steps" ADD COLUMN     "memory_mb" DOUBLE PRECISION;
-- AlterTable
ALTER TABLE "executions" ADD COLUMN     "replay_from_node_id" TEXT,
ADD COLUMN     "trace_id" TEXT;
-- CreateIndex
CREATE INDEX "executions_trace_id_idx" ON "executions"("trace_id");
