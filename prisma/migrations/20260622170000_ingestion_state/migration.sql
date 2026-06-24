-- CreateTable
CREATE TABLE "IngestionCursor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "lastImportedAt" DATETIME,
    "lastSuccessfulImportAt" DATETIME,
    "lastRunAt" DATETIME,
    "lastStatus" TEXT,
    "lastError" TEXT,
    "recordsImported" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProcessedArchiveDate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "releaseTag" TEXT,
    "assetNames" TEXT,
    "filesScanned" INTEGER NOT NULL DEFAULT 0,
    "filesMatched" INTEGER NOT NULL DEFAULT 0,
    "recordsParsed" INTEGER NOT NULL DEFAULT 0,
    "privateJetMatches" INTEGER NOT NULL DEFAULT 0,
    "recordsImported" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "processedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "IngestionCursor_provider_mode_key" ON "IngestionCursor"("provider", "mode");

-- CreateIndex
CREATE INDEX "IngestionCursor_provider_mode_lastSuccessfulImportAt_idx" ON "IngestionCursor"("provider", "mode", "lastSuccessfulImportAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedArchiveDate_provider_dateKey_key" ON "ProcessedArchiveDate"("provider", "dateKey");

-- CreateIndex
CREATE INDEX "ProcessedArchiveDate_provider_status_idx" ON "ProcessedArchiveDate"("provider", "status");
