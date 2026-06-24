ALTER TABLE "ImportLog" ADD COLUMN "mode" TEXT;
ALTER TABLE "ImportLog" ADD COLUMN "runStartedAt" DATETIME;
ALTER TABLE "ImportLog" ADD COLUMN "runEndedAt" DATETIME;
ALTER TABLE "ImportLog" ADD COLUMN "recordsFetched" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportLog" ADD COLUMN "recordsConsidered" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "ImportLog_provider_mode_timestamp_idx" ON "ImportLog"("provider", "mode", "timestamp");
