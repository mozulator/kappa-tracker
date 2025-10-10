-- CreateTable
CREATE TABLE "quests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "trader" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "objectives" TEXT NOT NULL,
    "prerequisiteQuests" TEXT,
    "traderLoyalty" INTEGER NOT NULL DEFAULT 1,
    "requiredForKappa" BOOLEAN NOT NULL DEFAULT false,
    "wikiLink" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "user_progress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pmcLevel" INTEGER NOT NULL DEFAULT 1,
    "completedQuests" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
