-- `prisma migrate dev --create-only` incluiu, de novo, o mesmo drift espurio
-- de `DROP INDEX "chunks_embedding_hnsw_idx"` documentado acima do model Chunk
-- em schema.prisma (ja aconteceu com password_reset_tokens,
-- workspace_alert_settings, workflow_api_keys, workflow_error_workflow,
-- execution_pause e execution_approvals). Removido antes de aplicar.

-- AlterTable
--
-- env/headers passam a ser gravados criptografados (AES-256-GCM, ADR-007). As
-- colunas antigas em claro (`env`, `headers`) continuam aqui de proposito: o
-- valor so pode ser criptografado pela aplicacao, que tem a chave, entao o
-- backfill roda no boot da API/worker (McpService.onModuleInit) e zera as
-- colunas legadas linha a linha. Dropar aqui perderia os tokens dos servidores
-- ja registrados.
ALTER TABLE "mcp_servers" ADD COLUMN     "env_encrypted" TEXT,
ADD COLUMN     "headers_encrypted" TEXT;
