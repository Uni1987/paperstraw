import { prisma } from "@/lib/prisma";
import {
  buildGlobalLocalFilterStatusReport,
  type GlobalLocalFilterStatusReport
} from "@/lib/cruises/globalLocalFilterStatus";
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

type CountRow = { count: number | bigint | string | null };
type LatestPositionRow = { latest_timestamp: Date | string | null };

export async function buildCruiseOpsStatus(now = new Date()): Promise<CruiseOpsStatus> {
  const [status24h, status7d, status30d, latestPositionAt, pendingCandidates, repairPlan] = await Promise.all([
    buildGlobalLocalFilterStatusReport({ sinceHours: 24, format: "json", force: false, includeReviewDetails: false, includeVesselDetails: false, now }),
    buildGlobalLocalFilterStatusReport({ sinceHours: 24 * 7, format: "json", force: false, includeReviewDetails: false, includeVesselDetails: false, now }),
    buildGlobalLocalFilterStatusReport({ sinceHours: 24 * 30, format: "json", force: false, includeReviewDetails: false, includeVesselDetails: false, now }),
    getLatestVerifiedPositionTimestamp(),
    getPendingMmsiCandidates(),
    planAppliedMmsiLinkRepair()
  ]);

  const accepted = status24h.registry.acceptedRegistryEntries;
  const verified = status24h.registry.verifiedPublicEligibleVessels;
  const linked = status24h.registry.verifiedVesselsWithLinkedMmsi;
  const latestAgeMinutes = latestPositionAt ? Math.max(0, Math.round((now.getTime() - latestPositionAt.getTime()) / 60000)) : null;
  const publicEligibleRatio = calculateRatio(verified, accepted);
  const linkedRatio = calculateRatio(linked, accepted);
  const observed24hRatio = calculateRatio(status24h.registry.verifiedVesselsObservedLast24h, verified);
  const observed7dRatio = calculateRatio(status7d.registry.verifiedVesselsWithStoredPositionsInWindow, verified);
  const observed30dRatio = calculateRatio(status30d.registry.verifiedVesselsWithStoredPositionsInWindow, verified);

  const alerts = buildCruiseOpsAlerts({
    pendingCandidates: status24h.reviewQueue.pendingMmsiReviewCandidates,
    pendingConflicts: status24h.reviewQueue.pendingMmsiConflicts,
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
      storedVerifiedPositionsLast24h: status24h.positions.totalStoredCruisePositions,
      distinctVerifiedVesselsObservedLast24h: status24h.registry.verifiedVesselsObservedLast24h,
      invalidOrMissingCoordinatesLast24h: status24h.positions.invalidOrMissingCoordinatePositions
    },
    registry: {
      acceptedRegistryEntries: accepted,
      verifiedPublicEligibleVessels: verified,
      verifiedMmsisLoaded: status24h.registry.verifiedMmsisLoaded,
      verifiedVesselsWithLinkedMmsi: linked,
      publicEligibleRatio,
      linkedRatio
    },
    observationCoverage: {
      vesselsObservedLast24h: status24h.registry.verifiedVesselsObservedLast24h,
      vesselsObservedLast7d: status7d.registry.verifiedVesselsWithStoredPositionsInWindow,
      vesselsObservedLast30d: status30d.registry.verifiedVesselsWithStoredPositionsInWindow,
      observed24hRatio,
      observed7dRatio,
      observed30dRatio
    },
    reviewQueue: {
      totalRecords: status24h.reviewQueue.totalRecords,
      pendingCandidates: status24h.reviewQueue.pendingMmsiReviewCandidates,
      reviewedCandidates: status24h.reviewQueue.reviewedRecords,
      dismissedCandidates: status24h.reviewQueue.dismissedRecords,
      pendingConflicts: status24h.reviewQueue.pendingMmsiConflicts,
      conflictsTotal: status24h.reviewQueue.mmsiConflictCount,
      pendingCandidateList: pendingCandidates
    },
    safety: {
      pendingReviewCandidateExists: status24h.reviewQueue.pendingMmsiReviewCandidates > 0,
      conflictExists: status24h.reviewQueue.pendingMmsiConflicts > 0,
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

async function getLatestVerifiedPositionTimestamp() {
  const rows = await prisma.$queryRaw<LatestPositionRow[]>`
    SELECT MAX(p.timestamp) AS latest_timestamp
    FROM cruise_positions p
    INNER JOIN cruise_ships s ON s.id = p.ship_id
    INNER JOIN cruise_vessel_verifications v ON v.ship_id = s.id
    INNER JOIN cruise_vessel_registry_entries r ON r.id = v.registry_entry_id
    WHERE v.verification_status = 'VERIFIED_OCEAN_CRUISE'
      AND v.confidence = 'HIGH'
      AND r.registry_decision = 'ACCEPT'
      AND r.imo = s.imo
      AND p.latitude BETWEEN -90 AND 90
      AND p.longitude BETWEEN -180 AND 180
      AND NOT (p.latitude = 0 AND p.longitude = 0)
  `;
  return dateOrNull(rows[0]?.latest_timestamp ?? null);
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
