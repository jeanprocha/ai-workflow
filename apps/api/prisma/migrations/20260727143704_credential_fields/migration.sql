-- AlterTable
-- `updated_at` leva DEFAULT CURRENT_TIMESTAMP de proposito: o `migrate diff`
-- gera a coluna NOT NULL sem default (Prisma trata @updatedAt na camada de
-- aplicacao), o que falharia numa tabela que ja tem linhas. O default so
-- serve pra preencher as linhas existentes na hora do ALTER; dai em diante
-- quem escreve o valor e o Prisma.
ALTER TABLE "credentials"
  ADD COLUMN "fields_meta" JSONB,
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'secret',
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
