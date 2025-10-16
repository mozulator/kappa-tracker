-- AlterTable
ALTER TABLE "admin_chats" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "admin_chats_isPinned_idx" ON "admin_chats"("isPinned");

