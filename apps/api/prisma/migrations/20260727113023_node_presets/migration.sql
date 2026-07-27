-- CreateTable
CREATE TABLE "node_presets" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "node_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "node_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "node_presets_workspace_id_node_type_idx" ON "node_presets"("workspace_id", "node_type");

-- CreateIndex
CREATE UNIQUE INDEX "node_presets_workspace_id_node_type_name_key" ON "node_presets"("workspace_id", "node_type", "name");

-- AddForeignKey
ALTER TABLE "node_presets" ADD CONSTRAINT "node_presets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

