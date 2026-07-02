-- CreateEnum
CREATE TYPE "CruiseVesselSegment" AS ENUM ('OCEAN_CRUISE', 'EXPEDITION_CRUISE');

-- CreateEnum
CREATE TYPE "CruiseRegistryDecision" AS ENUM ('ACCEPT', 'EXCLUDE');

-- CreateEnum
CREATE TYPE "CruiseVesselActiveStatus" AS ENUM ('ACTIVE', 'RETIRED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CruiseVerificationStatus" AS ENUM ('VERIFIED_OCEAN_CRUISE', 'REVIEW_REQUIRED', 'EXCLUDED_NON_CRUISE', 'UNASSESSED');

-- CreateEnum
CREATE TYPE "CruiseVerificationConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateTable
CREATE TABLE "cruise_vessel_registry_entries" (
    "id" TEXT NOT NULL,
    "imo" TEXT NOT NULL,
    "canonical_name" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "operator_group" TEXT,
    "vessel_segment" "CruiseVesselSegment" NOT NULL,
    "registry_decision" "CruiseRegistryDecision" NOT NULL,
    "active_status" "CruiseVesselActiveStatus" NOT NULL,
    "source_name" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "source_checked_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "evidence" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cruise_vessel_registry_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cruise_vessel_verifications" (
    "id" TEXT NOT NULL,
    "ship_id" TEXT NOT NULL,
    "registry_entry_id" TEXT,
    "verification_status" "CruiseVerificationStatus" NOT NULL,
    "confidence" "CruiseVerificationConfidence" NOT NULL,
    "decision_source" TEXT NOT NULL,
    "evidence" JSONB,
    "assessed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cruise_vessel_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cruise_vessel_registry_entries_imo_key" ON "cruise_vessel_registry_entries"("imo");

-- CreateIndex
CREATE INDEX "cruise_vessel_registry_entries_registry_decision_idx" ON "cruise_vessel_registry_entries"("registry_decision");

-- CreateIndex
CREATE INDEX "cruise_vessel_registry_entries_vessel_segment_idx" ON "cruise_vessel_registry_entries"("vessel_segment");

-- CreateIndex
CREATE UNIQUE INDEX "cruise_vessel_verifications_ship_id_key" ON "cruise_vessel_verifications"("ship_id");

-- CreateIndex
CREATE INDEX "cruise_vessel_verifications_verification_status_idx" ON "cruise_vessel_verifications"("verification_status");

-- CreateIndex
CREATE INDEX "cruise_vessel_verifications_registry_entry_id_idx" ON "cruise_vessel_verifications"("registry_entry_id");

-- AddForeignKey
ALTER TABLE "cruise_vessel_verifications" ADD CONSTRAINT "cruise_vessel_verifications_ship_id_fkey" FOREIGN KEY ("ship_id") REFERENCES "cruise_ships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruise_vessel_verifications" ADD CONSTRAINT "cruise_vessel_verifications_registry_entry_id_fkey" FOREIGN KEY ("registry_entry_id") REFERENCES "cruise_vessel_registry_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
