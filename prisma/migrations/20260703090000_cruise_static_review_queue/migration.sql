-- Cruise static-data review queue for global-local-filter AIS ingestion.
-- This migration is intentionally isolated to cruise review-queue storage.

CREATE TYPE "CruiseStaticReviewClassification" AS ENUM (
  'ALREADY_LINKED_CONFIRMATION',
  'NEW_MMSI_CANDIDATE_FOR_EXISTING_REGISTRY_ENTRY',
  'MMSI_CONFLICT_REVIEW_REQUIRED'
);

CREATE TYPE "CruiseStaticReviewStatus" AS ENUM (
  'PENDING',
  'REVIEWED',
  'DISMISSED'
);

CREATE TABLE "cruise_static_data_review_queue" (
  "id" TEXT NOT NULL,
  "registry_entry_id" TEXT NOT NULL,
  "observed_mmsi" TEXT NOT NULL,
  "observed_at" TIMESTAMP(3) NOT NULL,
  "classification" "CruiseStaticReviewClassification" NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'GLOBAL_LOCAL_FILTER',
  "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "occurrence_count" INTEGER NOT NULL DEFAULT 1,
  "review_status" "CruiseStaticReviewStatus" NOT NULL DEFAULT 'PENDING',
  "resolved_at" TIMESTAMP(3),
  "resolution_notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "cruise_static_data_review_queue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cruise_static_data_review_queue_registry_entry_id_observed_mmsi_classification_key"
  ON "cruise_static_data_review_queue"("registry_entry_id", "observed_mmsi", "classification");

CREATE INDEX "cruise_static_data_review_queue_classification_idx"
  ON "cruise_static_data_review_queue"("classification");

CREATE INDEX "cruise_static_data_review_queue_review_status_idx"
  ON "cruise_static_data_review_queue"("review_status");

CREATE INDEX "cruise_static_data_review_queue_last_seen_at_idx"
  ON "cruise_static_data_review_queue"("last_seen_at");

ALTER TABLE "cruise_static_data_review_queue"
  ADD CONSTRAINT "cruise_static_data_review_queue_registry_entry_id_fkey"
  FOREIGN KEY ("registry_entry_id")
  REFERENCES "cruise_vessel_registry_entries"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
