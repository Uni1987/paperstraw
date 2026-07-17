import { prisma } from "@/lib/database/cruises";
import {
  evaluateMmsiCandidateForApproval,
  listMmsiReviewCandidates,
  planAppliedMmsiLinkRepair,
  type MmsiReviewRow
} from "@/lib/cruises/mmsiReviewWorkflow";

export const CRUISE_OPS_STALE_POSITION_MINUTES = 30;
export const CRUISE_OPS_PUBLIC_ELIGIBLE_RATIO_WARNING = 0.85;
export const CRUISE_OPS_OBSERVED_24H_RATIO_WARNING = 0.15;

export type CruiseOpsStatusLevel = "healthy" | "stale" | "warning" | "error";
export type CruiseOpsAlertLevel = "warning" | "error";

export type CruiseOpsAlert = {
  level: CruiseOpsAlertLevel;
  code: string;
  message: string;
};

export type CruiseAdminPendingCandidate = {
  id: string;
  vesselName: string;
  operator: string;
  registryImo: string;
  observedMmsi: string;
  classification: string;
  reviewStatus: string;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  occurrences: number;
  conflictReason: string | null;
  registryHasLinkedMmsi: boolean;
  observedMmsiLinkedElsewhere: boolean;
  safeToApprove: boolean;
  unsafeReason: string | null;
};

export type CruiseOpsStatus = {
  generatedAt: string;
  status: CruiseOpsStatusLevel;
  alerts: CruiseOpsAlert[];
  worker: {
    latestVerifiedPositionTimestamp: string | null;
    latestPositionAgeMinutes: number | null;
    storedVerifiedPositionsLast24h: number;
    distinctVerifiedVesselsObservedLast24h: number;
    invalidOrMissingCoordinatesLast24h: number;
  };
  registry: {
    acceptedRegistryEntries: number;
    verifiedPublicEligibleVessels: number;
    verifiedMmsisLoaded: number;
    verifiedVesselsWithLinkedMmsi: number;
    publicEligibleRatio: number;
    linkedRatio: number;
  };
  observationCoverage: {
    vesselsObservedLast24h: number;
    vesselsObservedLast7d: number;
    vesselsObservedLast30d: number;
    observed24hRatio: number;
    observed7dRatio: number;
    observed30dRatio: number;
  };
  reviewQueue: {
    totalRecords: number;
    pendingCandidates: number;
    reviewedCandidates: number;
    dismissedCandidates: number;
    pendingConflicts: number;
    conflictsTotal: number;
    pendingCandidateList: CruiseAdminPendingCandidate[];
  };
  safety: {
    pendingReviewCandidateExists: boolean;
    conflictExists: boolean;
    repairNeededCount: number;
    reconcileSummary: {
      acceptedRegistryEntries: number;
      verifiedPublicEligibleVessels: number;
      missingPublicEligibilityCount: number;
      note: string;
    };
  };
};

type CruiseOpsSnapshotRow = {
  accepted_registry_entries: number | bigint | string | null;
  verified_public_eligible_vessels: number | bigint | string | null;
  verified_mmsis_loaded: number | bigint | string | null;
  latest_position_at: Date | string | null;
  stored_positions_last_24h: number | bigint | string | null;
  invalid_positions_last_24h: number | bigint | string | null;
  observed_vessels_last_24h: number | bigint | string | null;
  observed_vessels_last_7d: number | bigint | string | null;
  observed_vessels_last_30d: number | bigint | string | null;
  total_review_records: number | bigint | string | null;
  reviewed_candidates: number | bigint | string | null;
  dismissed_candidates: number | bigint | string | null;
  pending_candidates: number | bigint | string | null;
  pending_conflicts: number | bigint | string | null;
  conflicts_total: number | bigint | string | null;
};

export async function buildCruiseOpsStatus(now = new Date()): Promise<CruiseOpsStatus> {
  // Keep the admin page within the deliberately small Vercel connection pool.
  // The previous implementation ran three full status audits concurrently.
  const snapshot = await getCruiseOpsSnapshot(now);
  const pendingCandidates = await getPendingMmsiCandidates();
  const repairPlan = await planAppliedMmsiLinkRepair();

  const accepted = numberFromDb(snapshot.accepted_registry_entries);
  const verified = numberFromDb(snapshot.verified_public_eligible_vessels);
  const linked = numberFromDb(snapshot.verified_mmsis_loaded);
  const latestPositionAt = dateOrNull(snapshot.latest_position_at);
  const observed24h = numberFromDb(snapshot.observed_vessels_last_24h);
  const observed7d = numberFromDb(snapshot.observed_vessels_last_7d);
  const observed30d = numberFromDb(snapshot.observed_vessels_last_30d);
  const latestAgeMinutes = latestPositionAt ? Math.max(0, Math.round((now.getTime() - latestPositionAt.getTime()) / 60000)) : null;
  const publicEligibleRatio = calculateRatio(verified, accepted);
  const linkedRatio = calculateRatio(linked, accepted);
  const observed24hRatio = calculateRatio(observed24h, verified);
  const observed7dRatio = calculateRatio(observed7d, verified);
  const observed30dRatio = calculateRatio(observed30d, verified);

  const alerts = buildCruiseOpsAlerts({
    pendingCandidates: numberFromDb(snapshot.pending_candidates),
    pendingConflicts: numberFromDb(snapshot.pending_conflicts),
    latestPositionAgeMinutes: latestAgeMinutes,
    publicEligibleRatio,
    observed24hRatio,
    repairNeededCount: repairPlan.wouldRepair
  });
  const status = getCruiseOpsStatusLevel(alerts, latestAgeMinutes);

  return {
    generatedAt: now.toISOString(),
    status,
    alerts,
    worker: {
      latestVerifiedPositionTimestamp: latestPositionAt?.toISOString() ?? null,
      latestPositionAgeMinutes: latestAgeMinutes,
      storedVerifiedPositionsLast24h: numberFromDb(snapshot.stored_positions_last_24h),
      distinctVerifiedVesselsObservedLast24h: observed24h,
      invalidOrMissingCoordinatesLast24h: numberFromDb(snapshot.invalid_positions_last_24h)
    },
    registry: {
      acceptedRegistryEntries: accepted,
      verifiedPublicEligibleVessels: verified,
      verifiedMmsisLoaded: linked,
      verifiedVesselsWithLinkedMmsi: linked,
      publicEligibleRatio,
      linkedRatio
    },
    observationCoverage: {
      vesselsObservedLast24h: observed24h,
      vesselsObservedLast7d: observed7d,
      vesselsObservedLast30d: observed30d,
      observed24hRatio,
      observed7dRatio,
      observed30dRatio
    },
    reviewQueue: {
      totalRecords: numberFromDb(snapshot.total_review_records),
      pendingCandidates: numberFromDb(snapshot.pending_candidates),
      reviewedCandidates: numberFromDb(snapshot.reviewed_candidates),
      dismissedCandidates: numberFromDb(snapshot.dismissed_candidates),
      pendingConflicts: numberFromDb(snapshot.pending_conflicts),
      conflictsTotal: numberFromDb(snapshot.conflicts_total),
      pendingCandidateList: pendingCandidates
    },
    safety: {
      pendingReviewCandidateExists: numberFromDb(snapshot.pending_candidates) > 0,
      conflictExists: numberFromDb(snapshot.pending_conflicts) > 0,
      repairNeededCount: repairPlan.wouldRepair,
      reconcileSummary: {
        acceptedRegistryEntries: accepted,
        verifiedPublicEligibleVessels: verified,
        missingPublicEligibilityCount: Math.max(0, accepted - verified),
        note: "Read-only coverage equivalent. Broad registry reconcile apply is intentionally not run by this admin layer."
      }
    }
  };
}

export function calculateRatio(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return roundRatio(numerator / denominator);
}

export function buildCruiseOpsAlerts(input: {
  pendingCandidates: number;
  pendingConflicts: number;
  latestPositionAgeMinutes: number | null;
  publicEligibleRatio: number;
  observed24hRatio: number;
  repairNeededCount: number;
}): CruiseOpsAlert[] {
  const alerts: CruiseOpsAlert[] = [];
  if (input.pendingCandidates > 0) {
    alerts.push({ level: "warning", code: "PENDING_CANDIDATES", message: `${input.pendingCandidates} MMSI candidate(s) await review.` });
  }
  if (input.pendingConflicts > 0) {
    alerts.push({ level: "error", code: "PENDING_CONFLICTS", message: `${input.pendingConflicts} MMSI conflict(s) need manual review.` });
  }
  if (input.latestPositionAgeMinutes === null) {
    alerts.push({ level: "error", code: "NO_VERIFIED_POSITIONS", message: "No verified cruise position has been stored yet." });
  } else if (input.latestPositionAgeMinutes > CRUISE_OPS_STALE_POSITION_MINUTES) {
    alerts.push({
      level: "warning",
      code: "STALE_POSITIONS",
      message: `Latest verified position is ${input.latestPositionAgeMinutes} minute(s) old.`
    });
  }
  if (input.publicEligibleRatio < CRUISE_OPS_PUBLIC_ELIGIBLE_RATIO_WARNING) {
    alerts.push({ level: "warning", code: "LOW_PUBLIC_ELIGIBILITY", message: "Public-eligible registry ratio is below 85%." });
  }
  if (input.observed24hRatio < CRUISE_OPS_OBSERVED_24H_RATIO_WARNING) {
    alerts.push({ level: "warning", code: "LOW_24H_OBSERVATION", message: "24h verified-vessel observation ratio is below the monitoring threshold." });
  }
  if (input.repairNeededCount > 0) {
    alerts.push({ level: "warning", code: "REPAIR_NEEDED", message: `${input.repairNeededCount} applied MMSI link(s) need verification repair.` });
  }
  return alerts;
}

export function getCruiseOpsStatusLevel(alerts: CruiseOpsAlert[], latestPositionAgeMinutes: number | null): CruiseOpsStatusLevel {
  if (alerts.some((alert) => alert.level === "error")) return "error";
  if (latestPositionAgeMinutes !== null && latestPositionAgeMinutes > CRUISE_OPS_STALE_POSITION_MINUTES) return "stale";
  if (alerts.length > 0) return "warning";
  return "healthy";
}

export function formatCruiseOpsSummary(status: CruiseOpsStatus) {
  return [
    "Cruise operations summary",
    `Generated: ${status.generatedAt}`,
    `Status: ${status.status.toUpperCase()}`,
    "",
    "Registry",
    `- Accepted registry entries: ${status.registry.acceptedRegistryEntries}`,
    `- Verified public-eligible vessels: ${status.registry.verifiedPublicEligibleVessels}`,
    `- Verified MMSIs loaded: ${status.registry.verifiedMmsisLoaded}`,
    `- Public-eligible ratio: ${formatPercent(status.registry.publicEligibleRatio)}`,
    "",
    "Observation coverage",
    `- Observed 24h: ${status.observationCoverage.vesselsObservedLast24h} (${formatPercent(status.observationCoverage.observed24hRatio)})`,
    `- Observed 7d: ${status.observationCoverage.vesselsObservedLast7d} (${formatPercent(status.observationCoverage.observed7dRatio)})`,
    `- Observed 30d: ${status.observationCoverage.vesselsObservedLast30d} (${formatPercent(status.observationCoverage.observed30dRatio)})`,
    "",
    "Review queue",
    `- Pending candidates: ${status.reviewQueue.pendingCandidates}`,
    `- Pending conflicts: ${status.reviewQueue.pendingConflicts}`,
    `- Repair-needed count: ${status.safety.repairNeededCount}`,
    "",
    "Worker",
    `- Latest position: ${status.worker.latestVerifiedPositionTimestamp ?? "none"}`,
    `- Latest position age: ${status.worker.latestPositionAgeMinutes === null ? "n/a" : `${status.worker.latestPositionAgeMinutes} min`}`,
    "",
    "Alerts",
    ...(status.alerts.length ? status.alerts.map((alert) => `- ${alert.level.toUpperCase()} ${alert.code}: ${alert.message}`) : ["- none"])
  ].join("\n") + "\n";
}

async function getCruiseOpsSnapshot(now: Date) {
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<CruiseOpsSnapshotRow[]>`
    WITH eligible_ships AS (
      SELECT DISTINCT s.id, s.mmsi
      FROM cruise_ships s
      INNER JOIN cruise_vessel_verifications v ON v.ship_id = s.id
      INNER JOIN cruise_vessel_registry_entries r ON r.id = v.registry_entry_id
      WHERE v.verification_status = 'VERIFIED_OCEAN_CRUISE'
        AND v.confidence = 'HIGH'
        AND r.registry_decision = 'ACCEPT'
        AND r.imo = s.imo
    ),
    recent_positions AS (
      SELECT p.ship_id, p.timestamp, p.latitude, p.longitude
      FROM cruise_positions p
      INNER JOIN eligible_ships s ON s.id = p.ship_id
      WHERE p.timestamp >= ${last30d}
        AND p.timestamp <= ${now}
    ),
    latest_position AS (
      SELECT MAX(p.timestamp) AS latest_position_at
      FROM cruise_positions p
      INNER JOIN eligible_ships s ON s.id = p.ship_id
      WHERE p.timestamp <= ${now}
        AND p.latitude BETWEEN -90 AND 90
        AND p.longitude BETWEEN -180 AND 180
        AND NOT (p.latitude = 0 AND p.longitude = 0)
    ),
    position_metrics AS (
      SELECT
        COUNT(*) FILTER (WHERE timestamp >= ${last24h})::int AS stored_positions_last_24h,
        COUNT(*) FILTER (
          WHERE timestamp >= ${last24h}
            AND (
              latitude IS NULL OR longitude IS NULL
              OR latitude < -90 OR latitude > 90
              OR longitude < -180 OR longitude > 180
              OR (latitude = 0 AND longitude = 0)
            )
        )::int AS invalid_positions_last_24h,
        COUNT(DISTINCT ship_id) FILTER (
          WHERE timestamp >= ${last24h}
            AND latitude BETWEEN -90 AND 90
            AND longitude BETWEEN -180 AND 180
            AND NOT (latitude = 0 AND longitude = 0)
        )::int AS observed_vessels_last_24h,
        COUNT(DISTINCT ship_id) FILTER (
          WHERE timestamp >= ${last7d}
            AND latitude BETWEEN -90 AND 90
            AND longitude BETWEEN -180 AND 180
            AND NOT (latitude = 0 AND longitude = 0)
        )::int AS observed_vessels_last_7d,
        COUNT(DISTINCT ship_id) FILTER (
          WHERE latitude BETWEEN -90 AND 90
            AND longitude BETWEEN -180 AND 180
            AND NOT (latitude = 0 AND longitude = 0)
        )::int AS observed_vessels_last_30d
      FROM recent_positions
    ),
    review_metrics AS (
      SELECT
        COUNT(*)::int AS total_review_records,
        COUNT(*) FILTER (WHERE review_status = 'REVIEWED')::int AS reviewed_candidates,
        COUNT(*) FILTER (WHERE review_status = 'DISMISSED')::int AS dismissed_candidates,
        COUNT(*) FILTER (
          WHERE review_status = 'PENDING'
            AND classification = 'NEW_MMSI_CANDIDATE_FOR_EXISTING_REGISTRY_ENTRY'
        )::int AS pending_candidates,
        COUNT(*) FILTER (
          WHERE review_status = 'PENDING'
            AND classification = 'MMSI_CONFLICT_REVIEW_REQUIRED'
        )::int AS pending_conflicts,
        COUNT(*) FILTER (WHERE classification = 'MMSI_CONFLICT_REVIEW_REQUIRED')::int AS conflicts_total
      FROM cruise_static_data_review_queue
    )
    SELECT
      (SELECT COUNT(*)::int FROM cruise_vessel_registry_entries WHERE registry_decision = 'ACCEPT') AS accepted_registry_entries,
      (SELECT COUNT(*)::int FROM eligible_ships) AS verified_public_eligible_vessels,
      (SELECT COUNT(*)::int FROM eligible_ships WHERE mmsi IS NOT NULL) AS verified_mmsis_loaded,
      l.latest_position_at,
      p.stored_positions_last_24h,
      p.invalid_positions_last_24h,
      p.observed_vessels_last_24h,
      p.observed_vessels_last_7d,
      p.observed_vessels_last_30d,
      r.total_review_records,
      r.reviewed_candidates,
      r.dismissed_candidates,
      r.pending_candidates,
      r.pending_conflicts,
      r.conflicts_total
    FROM position_metrics p
    CROSS JOIN latest_position l
    CROSS JOIN review_metrics r
  `;

  return rows[0] ?? emptyCruiseOpsSnapshot();
}

function emptyCruiseOpsSnapshot(): CruiseOpsSnapshotRow {
  return {
    accepted_registry_entries: 0,
    verified_public_eligible_vessels: 0,
    verified_mmsis_loaded: 0,
    latest_position_at: null,
    stored_positions_last_24h: 0,
    invalid_positions_last_24h: 0,
    observed_vessels_last_24h: 0,
    observed_vessels_last_7d: 0,
    observed_vessels_last_30d: 0,
    total_review_records: 0,
    reviewed_candidates: 0,
    dismissed_candidates: 0,
    pending_candidates: 0,
    pending_conflicts: 0,
    conflicts_total: 0
  };
}

function numberFromDb(value: number | bigint | string | null | undefined) {
  return Number(value ?? 0);
}

async function getPendingMmsiCandidates(): Promise<CruiseAdminPendingCandidate[]> {
  const report = await listMmsiReviewCandidates({ status: "pending", limit: 100 });
  return report.rows
    .filter((row) => row.classification === "NEW_MMSI_CANDIDATE_FOR_EXISTING_REGISTRY_ENTRY")
    .map(toPendingCandidate);
}

function toPendingCandidate(row: MmsiReviewRow): CruiseAdminPendingCandidate {
  const unsafeReason = evaluateMmsiCandidateForApproval(row);
  return {
    id: row.id,
    vesselName: row.registryName ?? "Unknown vessel",
    operator: row.registryOperator ?? "Unknown operator",
    registryImo: row.registryImo ?? "Unknown",
    observedMmsi: row.observedMmsi,
    classification: row.classification,
    reviewStatus: row.reviewStatus,
    firstSeenAt: row.firstSeenAt?.toISOString?.() ?? null,
    lastSeenAt: row.lastSeenAt?.toISOString?.() ?? null,
    occurrences: row.occurrenceCount,
    conflictReason: getCandidateConflictReason(row),
    registryHasLinkedMmsi: Boolean(row.linkedMmsi),
    observedMmsiLinkedElsewhere: row.observedMmsiLinkedElsewhere,
    safeToApprove: unsafeReason === null,
    unsafeReason
  };
}

function getCandidateConflictReason(row: MmsiReviewRow) {
  if (row.observedMmsiLinkedElsewhere) return "Observed MMSI is already linked elsewhere.";
  if (row.hasUnresolvedConflict) return "Unresolved MMSI conflict exists.";
  if (row.linkedMmsi && row.linkedMmsi !== row.observedMmsi) return "Registry entry already has a different linked MMSI.";
  return null;
}

function dateOrNull(value: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function roundRatio(value: number) {
  return Math.round(value * 10000) / 10000;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}
