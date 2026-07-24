-- CreateEnum
CREATE TYPE "AiSuggestionType" AS ENUM ('autocomplete', 'copilot', 'debugger', 'cost_optimizer');

-- CreateEnum
CREATE TYPE "AiSuggestionStatus" AS ENUM ('pending', 'accepted', 'rejected');

-- CreateTable
CREATE TABLE "ai_suggestions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "workflow_id" TEXT,
    "execution_id" TEXT,
    "type" "AiSuggestionType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "AiSuggestionStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "ai_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_suggestions_workspace_id_idx" ON "ai_suggestions"("workspace_id");

-- CreateIndex
CREATE INDEX "ai_suggestions_workflow_id_idx" ON "ai_suggestions"("workflow_id");

-- AddForeignKey
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
