import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { AISSTREAM_MMSI_FILTER_LIMIT, splitMmsiBatches } from "@/lib/cruises/registryCoverage";

export const DEFAULT_VIABILITY_RECENT_DAYS = 7;
export const CURRENT_HYBRID_VERIFIED_BATCH_LIMIT = 2;

export type ViabilityReadinessStatus = "NOT_READY" | "LIMITED_BETA_ONLY" | "MAJOR_OPERATORS_TRACKING_POSSIBLE" | "GLOBAL_COVERAGE_NOT_YET_PROVEN";
export type ViabilityDecision = "NO_GO" | "CONDITIONAL_GO_FOR_LIMITED_BETA" | "CONDITIONAL_GO_FOR_MAJOR_OPERATOR_PRODUCT" | "GO_FOR_BROAD_PUBLIC_LAUNCH";
export type ClaimStatus = "SAFE_NOW" | "SAFE_WITH_QUALIFIER" | "NOT_YET_SAFE";

export type ViabilityRegistryEntry = {
  imo: string;
  operator: string;
  operatorGroup: string | null;
  vesselSegment: string;
  registryDecision: string;
  activeStatus: string;
};

export type ViabilityVerifiedShip = {
  shipId: string;
  imo: string | null;
  mmsi: string | null;
  operator: string;
  operatorGroup: string | null;
  vesselSegment: string;
};

export type ViabilityPosition = {
  shipId: string;
  timestamp: Date;
  latitude?: number | null;
  longitude?: number | null;
};

export type ViabilityEstimate = {
  shipId: string;
  date: Date;
  methodVersion: string;
};

export type OperatorCoverageManifestRow = {
  operator: string;
  parentGroup: string | null;
  segment: string;
  officialFleetCount: number | null;
  officialFleetCountSource: string | null;
  checkedAt: string | null;
  includedInRegistry: boolean;
  notes: string | null;
  status: string;
};

export type CruiseViabilityAuditInput = {
  recentDays: number;
  now: Date;
  registryEntries: ViabilityRegistryEntry[];
  verifiedShips: ViabilityVerifiedShip[];
  candidateShipCount: number;
  positions: ViabilityPosition[];
  estimates: ViabilityEstimate[];
  manifestRows: OperatorCoverageManifestRow[];
  identityConflictCount?: number;
  invalidPositionCount?: number;
};

type ExecutiveSummaryBase = {
  acceptedRegistryVessels: number;
  verifiedPublicEligibleVessels: number;
  registryVesselsWithLinkedMmsi: number;
  registryVesselsWithoutLinkedMmsi: number;
  verifiedVesselsRecentlySeenInAis: number;
  verifiedVesselsWithDailyEmissionsEstimates: number;
  currentlyTrackableVerifiedVesselsInHybridMode: number;
  currentlyExcludedVerifiedMmsisBecauseOfHybridBatchLimit: number;
  candidateVesselsInDiscoveryNotVerified: number;
};

type OperatorCoverageRow = {
  operator: string;
  acceptedVesselsInRegistry: number;
  vesselsWithMmsi: number;
  vesselsWithoutMmsi: number;
  mmsiLinkageRate: number;
  recentlySeenVessels: number;
  recentAisVisibilityRate: number;
  vesselsWithDailyEstimates: number;
  segmentBreakdown: Record<string, number>;
  officialExpectedFleetCountKnown: boolean;
  expectedFleetCount: number | null;
  registryFleetCoveragePercent: number | null;
};

type ClaimSafetyRow = { claim: string; status: ClaimStatus; reason: string; requiredEvidence: string };

type GoNoGoReport = {
  currentDecision: ViabilityDecision;
  evidenceSupportingDecision: string[];
  blockingGaps: string[];
  nonBlockingImprovements: string[];
  nextHighestValueActions: string[];
};

export type CruiseViabilityAudit = {
  generatedAt: string;
  recentDays: number;
  executiveSummary: ExecutiveSummaryBase & { readinessStatus: ViabilityReadinessStatus; readinessReasons: string[] };
  registryCoverageByOperator: OperatorCoverageRow[];
  unresolvedOperatorCoverage: Array<{
    operator: string;
    parentGroup: string | null;
    status: string;
    likelyRelevantToOceanCruiseScope: boolean;
    whyExcludedOrUnresolved: string;
    recommendedNextAction: string;
  }>;
  aisTrackingQuality: {
    verifiedGlobalLinkedMmsis: number;
    mmsisCurrentlyActiveInHybridConfiguration: number;
    mmsisTemporarilyExcludedByVerifiedBatchLimit: number;
    freshnessBuckets: { lessThan1Hour: number; lessThan24Hours: number; lessThan7Days: number; olderThan7Days: number; neverSeen: number };
    verifiedShipsWithNoPositionsEver: number;
    verifiedShipsWithPositionsButNoRecentPositions: number;
    verifiedShipsWithIdentityConflicts: number;
    verifiedShipsWithUnusableOrInvalidPositionData: number;
  };
  emissionsDataReadiness: {
    verifiedVesselsWithAtLeastOneDailyEstimate: number;
    verifiedVesselsWithEstimatesInRecentWindow: number;
    verifiedVesselsWithAisPositionsButNoDailyEstimate: number;
    duplicateOrOverlappingDailyEstimateGroups: number;
    estimateDateCoverage: { earliest: string | null; latest: string | null };
    publicYtdClaimSufficient: boolean;
    validationNote: string;
  };
  claimSafetyMatrix: ClaimSafetyRow[];
  goNoGoDecision: GoNoGoReport;
};

export function buildCruiseViabilityAudit(input: CruiseViabilityAuditInput): CruiseViabilityAudit {
  const acceptedRegistry = input.registryEntries.filter((entry) => entry.registryDecision === "ACCEPT");
  const verifiedByShipId = new Map(input.verifiedShips.map((ship) => [ship.shipId, ship]));
  const verifiedShipIds = new Set(verifiedByShipId.keys());
  const linkedMmsis = [...new Set(input.verifiedShips.map((ship) => ship.mmsi).filter(isValidMmsi))].sort();
  const recentSince = new Date(input.now.getTime() - input.recentDays * 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(input.now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(input.now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(input.now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const latestPositionByShip = new Map<string, ViabilityPosition>();
  for (const position of input.positions.filter((row) => verifiedShipIds.has(row.shipId))) {
    const existing = latestPositionByShip.get(position.shipId);
    if (!existing || position.timestamp > existing.timestamp) latestPositionByShip.set(position.shipId, position);
  }

  const recentSeenShipIds = new Set(
    [...latestPositionByShip.entries()].filter(([, position]) => position.timestamp >= recentSince).map(([shipId]) => shipId)
  );
  const estimateShipIds = new Set(input.estimates.filter((row) => verifiedShipIds.has(row.shipId)).map((row) => row.shipId));
  const recentEstimateShipIds = new Set(
    input.estimates.filter((row) => verifiedShipIds.has(row.shipId) && row.date >= recentSince).map((row) => row.shipId)
  );
  const duplicateEstimateGroups = countDuplicateEstimateGroups(input.estimates.filter((row) => verifiedShipIds.has(row.shipId)));
  const estimateDates = input.estimates.filter((row) => verifiedShipIds.has(row.shipId)).map((row) => row.date).sort((a, b) => a.getTime() - b.getTime());
  const hybridTrackableMmsis = linkedMmsis.slice(0, CURRENT_HYBRID_VERIFIED_BATCH_LIMIT * AISSTREAM_MMSI_FILTER_LIMIT);

  const executiveSummary = {
    acceptedRegistryVessels: acceptedRegistry.length,
    verifiedPublicEligibleVessels: input.verifiedShips.length,
    registryVesselsWithLinkedMmsi: linkedMmsis.length,
    registryVesselsWithoutLinkedMmsi: Math.max(0, acceptedRegistry.length - linkedMmsis.length),
    verifiedVesselsRecentlySeenInAis: recentSeenShipIds.size,
    verifiedVesselsWithDailyEmissionsEstimates: estimateShipIds.size,
    currentlyTrackableVerifiedVesselsInHybridMode: hybridTrackableMmsis.length,
    currentlyExcludedVerifiedMmsisBecauseOfHybridBatchLimit: Math.max(0, linkedMmsis.length - hybridTrackableMmsis.length),
    candidateVesselsInDiscoveryNotVerified: Math.max(0, input.candidateShipCount - input.verifiedShips.length)
  };
  const readiness = getReadinessStatus(executiveSummary, input.manifestRows, recentSeenShipIds.size, recentEstimateShipIds.size);
  const claimSafetyMatrix = buildClaimSafetyMatrix(executiveSummary, input.manifestRows);
  const decision = getGoNoGoDecision(executiveSummary, input.manifestRows, recentSeenShipIds.size, recentEstimateShipIds.size);

  return {
    generatedAt: input.now.toISOString(),
    recentDays: input.recentDays,
    executiveSummary: {
      ...executiveSummary,
      readinessStatus: readiness.status,
      readinessReasons: readiness.reasons
    },
    registryCoverageByOperator: buildOperatorRows(acceptedRegistry, input.verifiedShips, latestPositionByShip, estimateShipIds, input.manifestRows, recentSince),
    unresolvedOperatorCoverage: input.manifestRows
      .filter((row) => !row.includedInRegistry || /unresolved|scope|exclude|review|unknown/i.test(row.status))
      .map((row) => ({
        operator: row.operator,
        parentGroup: row.parentGroup,
        status: row.status || "UNKNOWN",
        likelyRelevantToOceanCruiseScope: /ocean|expedition|cruise/i.test(row.segment) && !/river|ferry/i.test(row.segment),
        whyExcludedOrUnresolved: row.notes || "No authoritative fleet count or registry inclusion decision recorded.",
        recommendedNextAction: getRecommendedManifestAction(row)
      })),
    aisTrackingQuality: {
      verifiedGlobalLinkedMmsis: linkedMmsis.length,
      mmsisCurrentlyActiveInHybridConfiguration: hybridTrackableMmsis.length,
      mmsisTemporarilyExcludedByVerifiedBatchLimit: Math.max(0, linkedMmsis.length - hybridTrackableMmsis.length),
      freshnessBuckets: buildFreshnessBuckets(input.verifiedShips, latestPositionByShip, oneHourAgo, oneDayAgo, sevenDaysAgo),
      verifiedShipsWithNoPositionsEver: input.verifiedShips.length - latestPositionByShip.size,
      verifiedShipsWithPositionsButNoRecentPositions: [...latestPositionByShip.values()].filter((position) => position.timestamp < recentSince).length,
      verifiedShipsWithIdentityConflicts: input.identityConflictCount ?? 0,
      verifiedShipsWithUnusableOrInvalidPositionData: input.invalidPositionCount ?? 0
    },
    emissionsDataReadiness: {
      verifiedVesselsWithAtLeastOneDailyEstimate: estimateShipIds.size,
      verifiedVesselsWithEstimatesInRecentWindow: recentEstimateShipIds.size,
      verifiedVesselsWithAisPositionsButNoDailyEstimate: [...latestPositionByShip.keys()].filter((shipId) => !estimateShipIds.has(shipId)).length,
      duplicateOrOverlappingDailyEstimateGroups: duplicateEstimateGroups,
      estimateDateCoverage: estimateDates.length
        ? { earliest: estimateDates[0].toISOString().slice(0, 10), latest: estimateDates[estimateDates.length - 1].toISOString().slice(0, 10) }
        : { earliest: null, latest: null },
      publicYtdClaimSufficient: false,
      validationNote: "Emission model validation against independent references is still required."
    },
    claimSafetyMatrix,
    goNoGoDecision: {
      currentDecision: decision.decision,
      evidenceSupportingDecision: decision.evidence,
      blockingGaps: decision.blockingGaps,
      nonBlockingImprovements: decision.nonBlockingImprovements,
      nextHighestValueActions: decision.nextActions
    }
  };
}

export async function buildCruiseViabilityAuditFromDatabase(options: { recentDays: number; manifestPath: string; now?: Date }) {
  const now = options.now ?? new Date();
  const tables = await getCruiseTableStatus();
  const manifestRows = parseOperatorCoverageManifest(readFileSync(options.manifestPath, "utf8"));
  const registryEntries = tables.registryExists ? await getRegistryEntries() : [];
  const verifiedShips = tables.registryExists && tables.verificationExists && tables.shipsExists ? await getVerifiedShips() : [];
  const candidateShipCount = tables.shipsExists ? await countSql`SELECT COUNT(*)::int AS count FROM cruise_ships` : 0;
  const positions = tables.positionsExists ? await getVerifiedPositions() : [];
  const estimates = tables.estimatesExists ? await getVerifiedEstimates() : [];
  const invalidPositionCount = tables.positionsExists ? await countSql`
    SELECT COUNT(*)::int AS count
    FROM cruise_positions
    WHERE latitude < -90 OR latitude > 90 OR longitude < -180 OR longitude > 180
  ` : 0;
  return buildCruiseViabilityAudit({
    recentDays: options.recentDays,
    now,
    registryEntries,
    verifiedShips,
    candidateShipCount,
    positions,
    estimates,
    manifestRows,
    invalidPositionCount
  });
}

export function parseOperatorCoverageManifest(content: string): OperatorCoverageManifestRow[] {
  return parseCsv(content).map((row) => ({
    operator: getCsv(row, "operator"),
    parentGroup: getCsv(row, "parentGroup") || null,
    segment: getCsv(row, "segment") || "UNKNOWN",
    officialFleetCount: parseOptionalInteger(getCsv(row, "officialFleetCount")),
    officialFleetCountSource: getCsv(row, "officialFleetCountSource") || null,
    checkedAt: getCsv(row, "checkedAt") || null,
    includedInRegistry: /^true$/i.test(getCsv(row, "includedInRegistry")),
    notes: getCsv(row, "notes") || null,
    status: getCsv(row, "status") || "UNKNOWN"
  }));
}

export function formatCruiseViabilityAudit(report: CruiseViabilityAudit, format: "terminal" | "json" | "markdown") {
  if (format === "json") return `${JSON.stringify(report, null, 2)}\n`;
  if (format === "markdown") return formatMarkdown(report);
  return formatTerminal(report);
}

function buildOperatorRows(
  acceptedRegistry: ViabilityRegistryEntry[],
  verifiedShips: ViabilityVerifiedShip[],
  latestPositionByShip: Map<string, ViabilityPosition>,
  estimateShipIds: Set<string>,
  manifestRows: OperatorCoverageManifestRow[],
  recentSince: Date
) {
  const manifestByOperator = new Map(manifestRows.map((row) => [row.operator, row]));
  const verifiedByOperator = groupBy(verifiedShips, (ship) => ship.operator);
  const acceptedByOperator = groupBy(acceptedRegistry, (entry) => entry.operator);
  return [...acceptedByOperator.entries()]
    .map(([operator, entries]) => {
      const ships = verifiedByOperator.get(operator) ?? [];
      const withMmsi = ships.filter((ship) => isValidMmsi(ship.mmsi)).length;
      const recentlySeen = ships.filter((ship) => {
        const latest = latestPositionByShip.get(ship.shipId);
        return latest && latest.timestamp >= recentSince;
      }).length;
      const withEstimates = ships.filter((ship) => estimateShipIds.has(ship.shipId)).length;
      const expected = manifestByOperator.get(operator)?.officialFleetCount ?? null;
      return {
        operator,
        acceptedVesselsInRegistry: entries.length,
        vesselsWithMmsi: withMmsi,
        vesselsWithoutMmsi: Math.max(0, entries.length - withMmsi),
        mmsiLinkageRate: percentage(withMmsi, entries.length),
        recentlySeenVessels: recentlySeen,
        recentAisVisibilityRate: percentage(recentlySeen, entries.length),
        vesselsWithDailyEstimates: withEstimates,
        segmentBreakdown: countBy(entries, (entry) => entry.vesselSegment),
        officialExpectedFleetCountKnown: expected !== null,
        expectedFleetCount: expected,
        registryFleetCoveragePercent: expected ? percentage(entries.length, expected) : null
      };
    })
    .sort((a, b) => b.acceptedVesselsInRegistry - a.acceptedVesselsInRegistry || b.vesselsWithMmsi - a.vesselsWithMmsi);
}

function buildClaimSafetyMatrix(summary: ExecutiveSummaryBase, manifestRows: OperatorCoverageManifestRow[]): ClaimSafetyRow[] {
  const hasKnownDenominators = manifestRows.some((row) => row.officialFleetCount !== null);
  const hasRecentVerifiedTracking = summary.verifiedPublicEligibleVessels > 0 && summary.verifiedVesselsRecentlySeenInAis > 0;
  const hasEstimates = summary.verifiedVesselsWithDailyEmissionsEstimates > 0;
  return [
    {
      claim: "Tracking a verified subset of ocean cruise ships",
      status: hasRecentVerifiedTracking ? "SAFE_WITH_QUALIFIER" : "NOT_YET_SAFE",
      reason: hasRecentVerifiedTracking ? "Verified high-confidence registry matches have recent AIS observations, but coverage is partial." : "No recent verified AIS observations are available in the selected window.",
      requiredEvidence: "Keep strict exact-IMO verification and clearly state subset/window limits."
    },
    {
      claim: "Tracking major ocean cruise operators",
      status: summary.verifiedPublicEligibleVessels >= 100 && summary.registryVesselsWithLinkedMmsi >= 100 ? "SAFE_WITH_QUALIFIER" : "NOT_YET_SAFE",
      reason: "Multiple major operators are represented, but official fleet denominators are incomplete.",
      requiredEvidence: "Document expected fleet counts and registry completeness per operator."
    },
    {
      claim: "Tracking X% of the global ocean cruise fleet",
      status: hasKnownDenominators ? "SAFE_WITH_QUALIFIER" : "NOT_YET_SAFE",
      reason: hasKnownDenominators ? "Some denominators are known, but global denominator completeness still needs review." : "No authoritative global denominator is recorded in the operator manifest.",
      requiredEvidence: "Authoritative operator/global fleet denominators and measured coverage calculations."
    },
    {
      claim: "Tracking global cruise ship emissions",
      status: "NOT_YET_SAFE",
      reason: "Registry/operator completeness and independent emissions-model validation are not yet proven.",
      requiredEvidence: "High measured coverage, robust AIS availability, MRV/benchmark validation, and scoped public claims."
    },
    {
      claim: "Showing estimated emissions for verified vessels",
      status: hasEstimates ? "SAFE_WITH_QUALIFIER" : "NOT_YET_SAFE",
      reason: hasEstimates ? "Daily estimates exist for verified vessels, but model validation is still required." : "No verified-vessel daily estimates are available.",
      requiredEvidence: "Independent emissions benchmark validation and methodology documentation."
    }
  ] as Array<{ claim: string; status: ClaimStatus; reason: string; requiredEvidence: string }>;
}

function getReadinessStatus(
  summary: ExecutiveSummaryBase,
  manifestRows: OperatorCoverageManifestRow[],
  recentSeen: number,
  recentEstimates: number
): { status: ViabilityReadinessStatus; reasons: string[] } {
  const criticalReasons: string[] = [];
  if (summary.verifiedPublicEligibleVessels < 25) criticalReasons.push("Registry-linked verified public-eligible vessel count is below a meaningful subset threshold.");
  if (recentSeen === 0) criticalReasons.push("No verified vessels were observed in AIS within the selected recent window.");
  if (summary.verifiedVesselsWithDailyEmissionsEstimates === 0 || recentEstimates === 0) criticalReasons.push("Daily emissions estimates are missing or not recent for verified vessels.");
  if (criticalReasons.length) return { status: "NOT_READY", reasons: criticalReasons };
  if (!manifestRows.some((row) => row.officialFleetCount !== null)) {
    return {
      status: "GLOBAL_COVERAGE_NOT_YET_PROVEN",
      reasons: ["Verified subset tracking and estimates exist, but official operator/global fleet denominators are UNKNOWN."]
    };
  }
  return {
    status: "LIMITED_BETA_ONLY",
    reasons: ["Verified tracking and estimates exist for a defensible subset, but global/operator completeness and emissions validation remain incomplete."]
  };
}

function getGoNoGoDecision(
  summary: ExecutiveSummaryBase,
  manifestRows: OperatorCoverageManifestRow[],
  recentSeen: number,
  recentEstimates: number
): { decision: ViabilityDecision; evidence: string[]; blockingGaps: string[]; nonBlockingImprovements: string[]; nextActions: string[] } {
  const noGo = summary.verifiedPublicEligibleVessels < 25 || recentSeen === 0 || summary.verifiedVesselsWithDailyEmissionsEstimates === 0 || recentEstimates === 0;
  const blockingGaps = [
    !manifestRows.some((row) => row.officialFleetCount !== null) ? "Authoritative fleet denominators are not recorded; global percentage claims are unsafe." : null,
    "Emission model validation against independent references is still required.",
    summary.currentlyExcludedVerifiedMmsisBecauseOfHybridBatchLimit > 0 ? "Current hybrid mode excludes some verified MMSIs because of the practical connection limit." : null
  ].filter(Boolean) as string[];
  return {
    decision: (noGo ? "NO_GO" : "CONDITIONAL_GO_FOR_LIMITED_BETA") as ViabilityDecision,
    evidence: [
      `${summary.verifiedPublicEligibleVessels} verified public-eligible vessels.`,
      `${summary.registryVesselsWithLinkedMmsi} verified vessels have MMSI for tracking.`,
      `${recentSeen} verified vessels observed within the selected window.`,
      `${summary.verifiedVesselsWithDailyEmissionsEstimates} verified vessels have daily estimates.`
    ],
    blockingGaps: noGo
      ? ["Verified tracking, recent AIS visibility, or emissions estimates are not yet sufficient for a public launch.", ...blockingGaps]
      : blockingGaps,
    nonBlockingImprovements: ["Expand curated registry coverage.", "Record official fleet-count sources.", "Improve MMSI linkage for verified ships."],
    nextActions: [
      "Add authoritative fleet-count evidence to the operator coverage manifest.",
      "Link missing verified registry entries to MMSIs where authoritative sources allow it.",
      "Run hybrid with --verified-batch-limit 2 for stable three-connection diagnostics.",
      "Benchmark daily emissions estimates against independent MRV or operator disclosures.",
      "Resolve known operator scope gaps before making major-operator or global claims."
    ]
  };
}

function buildFreshnessBuckets(verifiedShips: ViabilityVerifiedShip[], latestPositionByShip: Map<string, ViabilityPosition>, oneHourAgo: Date, oneDayAgo: Date, sevenDaysAgo: Date) {
  const buckets = { lessThan1Hour: 0, lessThan24Hours: 0, lessThan7Days: 0, olderThan7Days: 0, neverSeen: 0 };
  for (const ship of verifiedShips) {
    const latest = latestPositionByShip.get(ship.shipId);
    if (!latest) buckets.neverSeen += 1;
    else if (latest.timestamp >= oneHourAgo) buckets.lessThan1Hour += 1;
    else if (latest.timestamp >= oneDayAgo) buckets.lessThan24Hours += 1;
    else if (latest.timestamp >= sevenDaysAgo) buckets.lessThan7Days += 1;
    else buckets.olderThan7Days += 1;
  }
  return buckets;
}

function countDuplicateEstimateGroups(rows: ViabilityEstimate[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.shipId}|${row.date.toISOString().slice(0, 10)}|${row.methodVersion}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.values()].filter((count) => count > 1).length;
}

function formatTerminal(report: CruiseViabilityAudit) {
  const lines = [
    "Cruise Coverage & Viability Audit",
    `Generated: ${report.generatedAt}`,
    `Recent window: ${report.recentDays} day(s)`,
    "",
    "A. EXECUTIVE SUMMARY",
    ...Object.entries(report.executiveSummary).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join("; ") : value}`),
    "",
    "F. CLAIM SAFETY MATRIX",
    ...report.claimSafetyMatrix.map((row) => `${row.status} | ${row.claim} | ${row.reason}`),
    "",
    "G. GO / NO-GO DECISION",
    `Current decision: ${report.goNoGoDecision.currentDecision}`,
    `Blocking gaps: ${report.goNoGoDecision.blockingGaps.join(" | ") || "None"}`,
    "",
    "B. REGISTRY COVERAGE BY OPERATOR",
    ...report.registryCoverageByOperator.map((row) => `${row.operator}: accepted=${row.acceptedVesselsInRegistry}, mmsi=${row.vesselsWithMmsi}, recent=${row.recentlySeenVessels}, expected=${row.expectedFleetCount ?? "UNKNOWN"}`),
    "",
    "C. KNOWN UNRESOLVED OPERATORS FROM THE CURRENT INTERNAL SCOPE REVIEW",
    ...report.unresolvedOperatorCoverage.map((row) => `${row.operator}: ${row.status} - ${row.recommendedNextAction}`)
  ];
  return `${lines.join("\n")}\n`;
}

function formatMarkdown(report: CruiseViabilityAudit) {
  return `# Cruise Coverage & Viability Audit

Generated: ${report.generatedAt}  
Recent window: ${report.recentDays} day(s)

## Executive Summary

${Object.entries(report.executiveSummary).map(([key, value]) => `- **${key}:** ${Array.isArray(value) ? value.join("; ") : value}`).join("\n")}

## Claim Safety Matrix

| Claim | Status | Reason | Required evidence |
| --- | --- | --- | --- |
${report.claimSafetyMatrix.map((row) => `| ${row.claim} | ${row.status} | ${row.reason} | ${row.requiredEvidence} |`).join("\n")}

## Go / No-Go Decision

**Current decision:** ${report.goNoGoDecision.currentDecision}

### Evidence
${report.goNoGoDecision.evidenceSupportingDecision.map((item) => `- ${item}`).join("\n")}

### Blocking Gaps
${report.goNoGoDecision.blockingGaps.map((item) => `- ${item}`).join("\n") || "- None"}

### Next Highest-Value Actions
${report.goNoGoDecision.nextHighestValueActions.map((item) => `- ${item}`).join("\n")}

## Registry Coverage By Operator

| Operator | Accepted | With MMSI | Recent AIS | Daily estimates | Expected fleet count | Registry coverage |
| --- | ---: | ---: | ---: | ---: | --- | --- |
${report.registryCoverageByOperator.map((row) => `| ${row.operator} | ${row.acceptedVesselsInRegistry} | ${row.vesselsWithMmsi} | ${row.recentlySeenVessels} | ${row.vesselsWithDailyEstimates} | ${row.expectedFleetCount ?? "UNKNOWN"} | ${row.registryFleetCoveragePercent ?? "UNKNOWN"} |`).join("\n")}

## Known Unresolved Operators From The Current Internal Scope Review

${report.unresolvedOperatorCoverage.map((row) => `- **${row.operator}:** ${row.status}. ${row.whyExcludedOrUnresolved} Next action: ${row.recommendedNextAction}.`).join("\n")}

## Emissions Data Readiness

- Verified vessels with at least one daily estimate: ${report.emissionsDataReadiness.verifiedVesselsWithAtLeastOneDailyEstimate}
- Verified vessels with estimates in recent window: ${report.emissionsDataReadiness.verifiedVesselsWithEstimatesInRecentWindow}
- Validation note: ${report.emissionsDataReadiness.validationNote}
`;
}

async function getCruiseTableStatus() {
  const rows = await prisma.$queryRaw<Array<{
    ships_exists: boolean;
    registry_exists: boolean;
    verification_exists: boolean;
    positions_exists: boolean;
    estimates_exists: boolean;
  }>>`
    SELECT
      to_regclass('public.cruise_ships') IS NOT NULL AS ships_exists,
      to_regclass('public.cruise_vessel_registry_entries') IS NOT NULL AS registry_exists,
      to_regclass('public.cruise_vessel_verifications') IS NOT NULL AS verification_exists,
      to_regclass('public.cruise_positions') IS NOT NULL AS positions_exists,
      to_regclass('public.cruise_emissions_daily_estimates') IS NOT NULL AS estimates_exists
  `;
  const row = rows[0];
  return {
    shipsExists: Boolean(row?.ships_exists),
    registryExists: Boolean(row?.registry_exists),
    verificationExists: Boolean(row?.verification_exists),
    positionsExists: Boolean(row?.positions_exists),
    estimatesExists: Boolean(row?.estimates_exists)
  };
}

async function getRegistryEntries(): Promise<ViabilityRegistryEntry[]> {
  return prisma.$queryRaw<ViabilityRegistryEntry[]>`
    SELECT imo, operator, operator_group AS "operatorGroup", vessel_segment AS "vesselSegment", registry_decision AS "registryDecision", active_status AS "activeStatus"
    FROM cruise_vessel_registry_entries
  `;
}

async function getVerifiedShips(): Promise<ViabilityVerifiedShip[]> {
  return prisma.$queryRaw<ViabilityVerifiedShip[]>`
    SELECT DISTINCT s.id AS "shipId", s.imo, s.mmsi, r.operator, r.operator_group AS "operatorGroup", r.vessel_segment AS "vesselSegment"
    FROM cruise_ships s
    INNER JOIN cruise_vessel_verifications v ON v.ship_id = s.id
    INNER JOIN cruise_vessel_registry_entries r ON r.id = v.registry_entry_id
    WHERE v.verification_status = 'VERIFIED_OCEAN_CRUISE'
      AND v.confidence = 'HIGH'
      AND r.registry_decision = 'ACCEPT'
      AND r.imo = s.imo
  `;
}

async function getVerifiedPositions(): Promise<ViabilityPosition[]> {
  return prisma.$queryRaw<ViabilityPosition[]>`
    SELECT p.ship_id AS "shipId", p.timestamp, p.latitude::float AS latitude, p.longitude::float AS longitude
    FROM cruise_positions p
    INNER JOIN cruise_ships s ON s.id = p.ship_id
    INNER JOIN cruise_vessel_verifications v ON v.ship_id = s.id
    INNER JOIN cruise_vessel_registry_entries r ON r.id = v.registry_entry_id
    WHERE v.verification_status = 'VERIFIED_OCEAN_CRUISE'
      AND v.confidence = 'HIGH'
      AND r.registry_decision = 'ACCEPT'
      AND r.imo = s.imo
  `;
}

async function getVerifiedEstimates(): Promise<ViabilityEstimate[]> {
  return prisma.$queryRaw<ViabilityEstimate[]>`
    SELECT e.ship_id AS "shipId", e.date, e.method_version AS "methodVersion"
    FROM cruise_emissions_daily_estimates e
    INNER JOIN cruise_ships s ON s.id = e.ship_id
    INNER JOIN cruise_vessel_verifications v ON v.ship_id = s.id
    INNER JOIN cruise_vessel_registry_entries r ON r.id = v.registry_entry_id
    WHERE v.verification_status = 'VERIFIED_OCEAN_CRUISE'
      AND v.confidence = 'HIGH'
      AND r.registry_decision = 'ACCEPT'
      AND r.imo = s.imo
  `;
}

async function countSql(strings: TemplateStringsArray, ...values: unknown[]) {
  const rows = await prisma.$queryRaw<Array<{ count: number }>>(strings, ...values);
  return Number(rows[0]?.count ?? 0);
}

function getRecommendedManifestAction(row: OperatorCoverageManifestRow) {
  if (/river|ferry/i.test(row.segment) || /non-ocean|exclude/i.test(row.status)) return "exclude permanently as non-ocean-cruise";
  if (/scope/i.test(row.status)) return "scope decision required";
  if (!row.officialFleetCountSource) return "research registry inclusion";
  return "await authoritative vessel identity source";
}

function parseCsv(content: string) {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [] as Record<string, string>[];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
    } else current += char;
  }
  values.push(current.trim());
  return values;
}

function getCsv(row: Record<string, string>, key: string) {
  return row[key]?.trim() ?? "";
}

function parseOptionalInteger(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(getKey(item), [...(groups.get(getKey(item)) ?? []), item]);
  return groups;
}

function countBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = getKey(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function isValidMmsi(value: unknown): value is string {
  return typeof value === "string" && /^\d{9}$/.test(value) && value !== "000000000";
}
