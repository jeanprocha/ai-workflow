-- `prisma migrate dev --create-only` incluiu, de novo, o mesmo drift espurio
-- de `DROP INDEX "chunks_embedding_hnsw_idx"` documentado acima do model
-- Chunk em schema.prisma (2a vez que isso acontece nesta rodada de H1 — ver
-- tambem 20260730023258_password_reset_tokens). Removido ANTES de aplicar
-- desta vez (--create-only evitou repetir o susto de editar apos aplicado).

-- CreateTable
CREATE TABLE "workspace_alert_settings" (
    "workspace_id" TEXT NOT NULL,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "webhook_url" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_alert_settings_pkey" PRIMARY KEY ("workspace_id")
);

-- AddForeignKey
ALTER TABLE "workspace_alert_settings" ADD CONSTRAINT "workspace_alert_settings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
