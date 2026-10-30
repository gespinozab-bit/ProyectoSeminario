-- AlterTable
ALTER TABLE "media_assets" ADD COLUMN     "is_primary" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "media_assets_content_id_is_primary_status_idx" ON "media_assets"("content_id", "is_primary", "status");
