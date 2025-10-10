-- Mark the failed migration as completed
-- Run this in Render Shell or Prisma Studio

-- First, delete the failed migration record
DELETE FROM "_prisma_migrations" WHERE migration_name = '20251010160610_add_overlay_tokens';

-- The next deploy will re-run the migration with the fixed SQL

