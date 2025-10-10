-- Update quest map assignments to Any Location for multi-map quests
UPDATE "quests" SET "mapName" = 'Any Location' WHERE "name" LIKE '%Fishing Place%';
UPDATE "quests" SET "mapName" = 'Any Location' WHERE "name" LIKE '%The Cult - Part 2%';
UPDATE "quests" SET "mapName" = 'Any Location' WHERE "name" LIKE '%Colleagues - Part 3%';

