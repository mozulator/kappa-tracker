-- CreateTable
CREATE TABLE "global_chats" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "profileColor" TEXT,
    "message" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "global_chats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "global_chats_timestamp_idx" ON "global_chats"("timestamp");
