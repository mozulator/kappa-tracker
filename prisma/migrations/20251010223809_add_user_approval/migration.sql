-- Add user approval fields
ALTER TABLE "users" ADD COLUMN "approved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Auto-approve and make admin for existing users (so current users aren't locked out)
UPDATE "users" SET "approved" = true;

-- Make the first user (oldest) an admin
UPDATE "users" SET "isAdmin" = true 
WHERE "id" = (SELECT "id" FROM "users" ORDER BY "createdAt" ASC LIMIT 1);

