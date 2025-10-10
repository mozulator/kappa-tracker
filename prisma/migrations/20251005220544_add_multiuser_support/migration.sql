/*
  Warnings:

  - Added the required column `userId` to the `user_progress` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "bio" TEXT,
    "twitchUrl" TEXT,
    "discordTag" TEXT
);

-- CreateTable
CREATE TABLE "quest_activities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "questId" TEXT NOT NULL,
    "questName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quest_activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_quests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "trader" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "objectives" TEXT NOT NULL,
    "prerequisiteQuests" TEXT,
    "traderLoyalty" INTEGER NOT NULL DEFAULT 1,
    "requiredForKappa" BOOLEAN NOT NULL DEFAULT false,
    "wikiLink" TEXT,
    "mapName" TEXT,
    "requiredItems" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_quests" ("createdAt", "id", "level", "name", "objectives", "prerequisiteQuests", "requiredForKappa", "trader", "traderLoyalty", "updatedAt", "wikiLink") SELECT "createdAt", "id", "level", "name", "objectives", "prerequisiteQuests", "requiredForKappa", "trader", "traderLoyalty", "updatedAt", "wikiLink" FROM "quests";
DROP TABLE "quests";
ALTER TABLE "new_quests" RENAME TO "quests";
CREATE TABLE "new_user_progress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "pmcLevel" INTEGER NOT NULL DEFAULT 1,
    "completedQuests" TEXT NOT NULL DEFAULT '[]',
    "completionRate" REAL NOT NULL DEFAULT 0,
    "totalCompleted" INTEGER NOT NULL DEFAULT 0,
    "lastQuestDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "user_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_user_progress" ("completedQuests", "createdAt", "id", "pmcLevel", "updatedAt") SELECT "completedQuests", "createdAt", "id", "pmcLevel", "updatedAt" FROM "user_progress";
DROP TABLE "user_progress";
ALTER TABLE "new_user_progress" RENAME TO "user_progress";
CREATE UNIQUE INDEX "user_progress_userId_key" ON "user_progress"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "quest_activities_userId_idx" ON "quest_activities"("userId");

-- CreateIndex
CREATE INDEX "quest_activities_timestamp_idx" ON "quest_activities"("timestamp");
