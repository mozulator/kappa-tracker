-- CreateTable
CREATE TABLE "site_settings" (
    "id" TEXT NOT NULL,
    "bannerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "bannerMessage" TEXT,
    "bannerUpdatedAt" TIMESTAMP(3) NOT NULL,
    "bannerUpdatedBy" TEXT,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);

-- Insert default settings row
INSERT INTO "site_settings" ("id", "bannerEnabled", "bannerMessage", "bannerUpdatedAt")
VALUES ('default', false, NULL, CURRENT_TIMESTAMP);

