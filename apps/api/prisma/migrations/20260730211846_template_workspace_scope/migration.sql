-- AlterTable
ALTER TABLE "templates" ADD COLUMN     "workspace_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "templates_workspace_id_name_key" ON "templates"("workspace_id", "name");

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
