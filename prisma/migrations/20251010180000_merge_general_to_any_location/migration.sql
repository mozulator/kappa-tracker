-- Merge all "General" map entries into "Any Location"
UPDATE "quests" SET "mapName" = 'Any Location' WHERE "mapName" = 'General';

