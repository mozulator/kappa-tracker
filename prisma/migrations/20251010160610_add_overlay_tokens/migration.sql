-- CreateTable
CREATE TABLE IF NOT EXISTS "overlay_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "overlay_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "overlay_tokens_token_key" ON "overlay_tokens"("token");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "overlay_tokens_token_idx" ON "overlay_tokens"("token");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "overlay_tokens_userId_idx" ON "overlay_tokens"("userId");

-- AddForeignKey
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'overlay_tokens_userId_fkey'
    ) THEN
        ALTER TABLE "overlay_tokens" ADD CONSTRAINT "overlay_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

