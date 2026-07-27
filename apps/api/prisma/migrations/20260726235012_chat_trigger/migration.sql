-- AlterEnum
ALTER TYPE "TriggerType" ADD VALUE 'chat';

-- AlterTable
ALTER TABLE "workflows" ADD COLUMN     "chat_token" TEXT,
ADD COLUMN     "inbox_token" TEXT;

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'web',
    "external_key" TEXT,
    "state" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "execution_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversations_workflow_id_updated_at_idx" ON "conversations"("workflow_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_workflow_id_channel_external_key_key" ON "conversations"("workflow_id", "channel", "external_key");

-- CreateIndex
CREATE INDEX "conversation_messages_conversation_id_created_at_idx" ON "conversation_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "workflows_chat_token_key" ON "workflows"("chat_token");

-- CreateIndex
CREATE UNIQUE INDEX "workflows_inbox_token_key" ON "workflows"("inbox_token");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

