-- CreateEnum
CREATE TYPE "McpTransport" AS ENUM ('stdio', 'sse', 'http');
-- CreateEnum
CREATE TYPE "McpServerStatus" AS ENUM ('connecting', 'connected', 'disconnected', 'error');
-- CreateTable
CREATE TABLE "mcp_servers" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "transport" "McpTransport" NOT NULL,
    "command" TEXT,
    "args" JSONB,
    "env" JSONB,
    "url" TEXT,
    "headers" JSONB,
    "status" "McpServerStatus" NOT NULL DEFAULT 'disconnected',
    "last_error" TEXT,
    "last_checked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mcp_servers_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "mcp_tools" (
    "id" TEXT NOT NULL,
    "mcp_server_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "input_schema" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mcp_tools_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "mcp_servers_workspace_id_idx" ON "mcp_servers"("workspace_id");
-- CreateIndex
CREATE UNIQUE INDEX "mcp_tools_mcp_server_id_name_key" ON "mcp_tools"("mcp_server_id", "name");
-- AddForeignKey
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "mcp_tools" ADD CONSTRAINT "mcp_tools_mcp_server_id_fkey" FOREIGN KEY ("mcp_server_id") REFERENCES "mcp_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
