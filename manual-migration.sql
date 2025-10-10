-- Manual migration for Render PostgreSQL
-- Run this if automatic migrations aren't working

-- Add tarkovDevId column (safe - won't error if exists)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='tarkovDevId') THEN
        ALTER TABLE "users" ADD COLUMN "tarkovDevId" TEXT;
    END IF;
END $$;

-- Add avatarUrl column (safe - won't error if exists)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='avatarUrl') THEN
        ALTER TABLE "users" ADD COLUMN "avatarUrl" TEXT;
    END IF;
END $$;

-- Verify columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name IN ('tarkovDevId', 'avatarUrl');

