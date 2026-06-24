-- CreateTable
CREATE TABLE "Aircraft" (
    "id" TEXT NOT NULL,
    "icaoHex" TEXT NOT NULL,
    "registration" TEXT,
    "aircraftType" TEXT NOT NULL,
    "verifiedPublicEntity" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Aircraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flight" (
    "id" TEXT NOT NULL,
    "aircraftId" TEXT NOT NULL,
    "originAirport" TEXT NOT NULL,
    "destinationAirport" TEXT NOT NULL,
    "departureAt" TIMESTAMP(3) NOT NULL,
    "arrivalAt" TIMESTAMP(3),
    "distanceKm" DECIMAL(65,30) NOT NULL,
    "estimatedCo2Kg" DECIMAL(65,30) NOT NULL,
    "dataSource" TEXT NOT NULL,
    "sourceRecordId" TEXT,
    "sourceAttribution" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Flight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmissionFactor" (
    "id" TEXT NOT NULL,
    "aircraftType" TEXT NOT NULL,
    "kgCo2PerKm" DECIMAL(65,30) NOT NULL,
    "basis" TEXT NOT NULL DEFAULT 'kg_co2_per_km',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmissionFactor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "mode" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "runStartedAt" TIMESTAMP(3),
    "runEndedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "recordsFetched" INTEGER NOT NULL DEFAULT 0,
    "recordsConsidered" INTEGER NOT NULL DEFAULT 0,
    "recordsImported" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT,

    CONSTRAINT "ImportLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionCursor" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "lastImportedAt" TIMESTAMP(3),
    "lastSuccessfulImportAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,
    "recordsImported" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedArchiveDate" (
    "id" TEXT NOT NULL,
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
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessedArchiveDate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AggregateRollup" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'ALL',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "flights" INTEGER NOT NULL DEFAULT 0,
    "distanceKm" DECIMAL(65,30) NOT NULL,
    "estimatedCo2Kg" DECIMAL(65,30) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AggregateRollup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Aircraft_icaoHex_key" ON "Aircraft"("icaoHex");

-- CreateIndex
CREATE INDEX "Aircraft_registration_idx" ON "Aircraft"("registration");

-- CreateIndex
CREATE INDEX "Aircraft_verifiedPublicEntity_idx" ON "Aircraft"("verifiedPublicEntity");

-- CreateIndex
CREATE INDEX "Flight_departureAt_idx" ON "Flight"("departureAt");

-- CreateIndex
CREATE INDEX "Flight_dataSource_idx" ON "Flight"("dataSource");

-- CreateIndex
CREATE INDEX "Flight_aircraftId_departureAt_idx" ON "Flight"("aircraftId", "departureAt");

-- CreateIndex
CREATE UNIQUE INDEX "Flight_dataSource_sourceRecordId_key" ON "Flight"("dataSource", "sourceRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "EmissionFactor_aircraftType_key" ON "EmissionFactor"("aircraftType");

-- CreateIndex
CREATE INDEX "ImportLog_provider_mode_timestamp_idx" ON "ImportLog"("provider", "mode", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "IngestionCursor_provider_mode_key" ON "IngestionCursor"("provider", "mode");

-- CreateIndex
CREATE INDEX "IngestionCursor_provider_mode_lastSuccessfulImportAt_idx" ON "IngestionCursor"("provider", "mode", "lastSuccessfulImportAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedArchiveDate_provider_dateKey_key" ON "ProcessedArchiveDate"("provider", "dateKey");

-- CreateIndex
CREATE INDEX "ProcessedArchiveDate_provider_status_idx" ON "ProcessedArchiveDate"("provider", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AggregateRollup_period_group_key_periodStart_key" ON "AggregateRollup"("period", "group", "key", "periodStart");

-- CreateIndex
CREATE INDEX "AggregateRollup_period_group_periodStart_idx" ON "AggregateRollup"("period", "group", "periodStart");

-- AddForeignKey
ALTER TABLE "Flight" ADD CONSTRAINT "Flight_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
