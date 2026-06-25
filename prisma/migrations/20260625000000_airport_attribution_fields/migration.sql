ALTER TABLE "Flight"
ADD COLUMN "originAirportIdent" TEXT,
ADD COLUMN "destinationAirportIdent" TEXT,
ADD COLUMN "originCountryCode" TEXT,
ADD COLUMN "destinationCountryCode" TEXT,
ADD COLUMN "attributionSource" TEXT,
ADD COLUMN "attributionConfidence" DECIMAL;
