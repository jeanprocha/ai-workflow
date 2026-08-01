-- O `prisma migrate dev` que gerou este arquivo incluiu, por engano,
-- `DROP INDEX "chunks_embedding_hnsw_idx"` — drift espurio ja documentado
-- acima do model Chunk em schema.prisma (Prisma nao representa indice HNSW
-- em coluna Unsupported, entao trata como "drift" em QUALQUER migration
-- nova). Removido manualmente seguindo a instrucao do proprio comentario;
-- indice recriado a mao no banco de dev local (ja tinha sido dropado antes
-- desta remocao).

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
