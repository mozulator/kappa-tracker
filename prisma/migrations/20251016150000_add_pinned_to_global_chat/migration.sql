-- AlterTable
ALTER TABLE "global_chats" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "global_chats_isPinned_idx" ON "global_chats"("isPinned");

