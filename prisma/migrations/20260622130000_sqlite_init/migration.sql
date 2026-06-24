-- CreateTable
CREATE TABLE "Aircraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "icaoHex" TEXT NOT NULL,
    "registration" TEXT,
    "aircraftType" TEXT NOT NULL,
    "verifiedPublicEntity" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Flight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "aircraftId" TEXT NOT NULL,
    "originAirport" TEXT NOT NULL,
    "destinationAirport" TEXT NOT NULL,
    "departureAt" DATETIME NOT NULL,
    "arrivalAt" DATETIME,
    "distanceKm" DECIMAL NOT NULL,
    "estimatedCo2Kg" DECIMAL NOT NULL,
    "dataSource" TEXT NOT NULL,
    "sourceRecordId" TEXT,
    "sourceAttribution" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Flight_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmissionFactor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "aircraftType" TEXT NOT NULL,
    "kgCo2PerKm" DECIMAL NOT NULL,
    "basis" TEXT NOT NULL DEFAULT 'kg_co2_per_km',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ImportLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "recordsImported" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT
);

-- CreateTable
CREATE TABLE "AggregateRollup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "period" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'ALL',
    "periodStart" DATETIME NOT NULL,
    "flights" INTEGER NOT NULL DEFAULT 0,
    "distanceKm" DECIMAL NOT NULL,
    "estimatedCo2Kg" DECIMAL NOT NULL,
    "updatedAt" DATETIME NOT NULL
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
CREATE UNIQUE INDEX "AggregateRollup_period_group_key_periodStart_key" ON "AggregateRollup"("period", "group", "key", "periodStart");

-- CreateIndex
CREATE INDEX "AggregateRollup_period_group_periodStart_idx" ON "AggregateRollup"("period", "group", "periodStart");
