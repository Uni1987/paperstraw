import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { prisma } from "@/lib/database/cruises";

export const PUBLIC_ELIGIBLE_TARGET_RATIO = 0.85;
export const OBSERVED_7D_TARGET_RATIO = 0.5;

export type LaunchReadinessStatus = "not ready" | "beta ready" | "public ready with caveats" | "public ready";
export type LaunchRecommendation = "live now as beta" | "wait for more MMSI candidates" | "expand registry first" | "fix data/model issue first";

export type LaunchReadinessSummary = {
  generatedAt: string;
  acceptedRegistryEntries: number;
  publicEligibleVessels: number;
  linkedMmsiVessels: number;
  observed24h: number;
  observed7d: number;
  observed30d: number;
  publicEligibleRatio: number;
  observed24hRatio: number;
  observed7dRatio: number;
  observed30dRatio: number;
  pendingCandidates: number;
  pendingConflicts: number;
  totalConflicts: number;
  readinessStatus: LaunchReadinessStatus;
  recommendation: LaunchRecommendation;
  blockers: string[];
  caveats: string[];
};

export type UnlinkedRegistryEntry = {
  vesselName: string;
  operator: string;
  imo: string;
  sourceStatus: string;
  sourceName: string | null;
  activeStatus: string;
  appearedInAisCandidateData: boolean;
  candidateHasMmsi: boolean;
  candidatePositionCount: number;
  latestCandidatePositionAt: string | null;
  inferredLifecycle: "active" | "future" | "inactive" | "uncertain";
  recommendedAction: "wait for AIS" | "investigate manually" | "exclude/out-of-scope candidate" | "needs source verification";
};

export type UnobservedLinkedVessel = {
  vesselName: string;
  operator: string;
  imo: string;
  missing24h: boolean;
  missing7d: boolean;
  missing30d: boolean;
  latestObservedAt: string | null;
};

export type OperatorCoverageRow = {
  operator: string;
  acceptedRegistryCount: number;
  publicEligibleCount: number;
  publicEligibleRatio: number;
  observed7dCount: number;
  observed30dCount: number;
  pendingCandidatesCount: number;
  conflictsCount: number;
  unlinkedCount: number;
  recommendation: string;
};

export type InventoryReviewRow = {
  operator: string;
  parentGroup: string;
  status: string;
  officialFleetCount: number | null;
  currentRegistryCount: number | null;
  approvedMmsiLinkedCount: number | null;
  unresolvedCount: number;
  excludedCount: number;
  thirdWaveReadyCount: number;
  nextAction: string | null;
};

export type LaunchReadinessReport = {
  summary: LaunchReadinessSummary;
  unlinkedRegistryEntries: UnlinkedRegistryEntry[];
  unobservedLinkedVessels: UnobservedLinkedVessel[];
  unobservedByOperator: Array<{ operator: string; missing24h: number; missing7d: number; missing30d: number }>;
  operatorCoverage: OperatorCoverageRow[];
  inventoryReview: {
    partialOperators: InventoryReviewRow[];
    scopeDecisionOperators: InventoryReviewRow[];
    futureExcludedOperators: InventoryReviewRow[];
    outOfScopeOperators: InventoryReviewRow[];
    estimatedAdditionalSafeRegistryPotential: number;
    estimatedVesselsToRemainExcluded: number;
  };
  safetyChecks: {
    readOnlyCommand: true;
    databaseWritesAttempted: 0;
    importsApplied: false;
    mmsiCandidatesApproved: false;
    registryChanged: false;
  };
};

type RawDb = {
  $queryRaw: <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
  $queryRawUnsafe: <T = unknown>(query: string, ...values: unknown[]) => Promise<T>;
};

type CountRow = { count: number | bigint | string | null };

type SummaryRow = {
  accepted_registry_entries: number | bigint | string | null;
  public_eligible_vessels: number | bigint | string | null;
  linked_mmsi_vessels: number | bigint | string | null;
  observed_24h: number | bigint | string | null;
  observed_7d: number | bigint | string | null;
  observed_30d: number | bigint | string | null;
  pending_candidates: number | bigint | string | null;
  pending_conflicts: number | bigint | string | null;
  total_conflicts: number | bigint | string | null;
};

type UnlinkedRow = {
  vessel_name: string;
  operator: string;
  imo: string;
  source_name: string | null;
  source_status: string;
  active_status: string;
  candidate_ship_id: string | null;
  candidate_mmsi: string | null;
  candidate_position_count: number | bigint | string | null;
  latest_candidate_position_at: Date | string | null;
};

type UnobservedRow = {
  vessel_name: string;
  operator: string;
  imo: string;
  latest_observed_at: Date | string | null;
};

type OperatorRow = {
  operator: string;
  accepted_registry_count: number | bigint | string | null;
  public_eligible_count: number | bigint | string | null;
  observed_7d_count: number | bigint | string | null;
  observed_30d_count: number | bigint | string | null;
  pending_candidates_count: number | bigint | string | null;
  conflicts_count: number | bigint | string | null;
};

export async function buildCruiseLaunchReadinessReport(
  options: { now?: Date; inventoryPath?: string } = {},
  db: RawDb = prisma
): Promise<LaunchReadinessReport> {
  const now = options.now ?? new Date();
  const starts = {
    last24h: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    last7d: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    last30d: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  };

  const [summaryRow, unlinkedRows, linkedRows, operatorRows] = await Promise.all([
    getSummaryRow(db, starts, now),
    getUnlinkedRows(db),
    getLinkedRows(db),
    getOperatorRows(db, starts, now)
  ]);

  const acceptedRegistryEntries = numberFromCount(summaryRow.accepted_registry_entries);
  const publicEligibleVessels = numberFromCount(summaryRow.public_eligible_vessels);
  const linkedMmsiVessels = numberFromCount(summaryRow.linked_mmsi_vessels);
  const observed24h = numberFromCount(summaryRow.observed_24h);
  const observed7d = numberFromCount(summaryRow.observed_7d);
  const observed30d = numberFromCount(summaryRow.observed_30d);
  const pendingCandidates = numberFromCount(summaryRow.pending_candidates);
  const pendingConflicts = numberFromCount(summaryRow.pending_conflicts);
  const totalConflicts = numberFromCount(summaryRow.total_conflicts);
  const publicEligibleRatio = calculateRatio(publicEligibleVessels, acceptedRegistryEntries);
  const observed24hRatio = calculateRatio(observed24h, publicEligibleVessels);
  const observed7dRatio = calculateRatio(observed7d, publicEligibleVessels);
  const observed30dRatio = calculateRatio(observed30d, publicEligibleVessels);
  const readiness = classifyLaunchReadiness({
    publicEligibleRatio,
    observed7dRatio,
    pendingConflicts,
    totalConflicts,
    acceptedRegistryEntries,
    publicEligibleVessels
  });
  const operatorCoverage = operatorRows.map((row) => toOperatorCoverageRow(row, acceptedRegistryEntries));
  const liveAcceptedByOperator = new Map(operatorCoverage.map((row) => [row.operator, row.acceptedRegistryCount]));
  const inventoryRows = enrichInventoryWithLiveCounts(
    parseLaunchInventory(options.inventoryPath ?? "data/cruises/global-operator-coverage-inventory.csv"),
    liveAcceptedByOperator
  );

  const unlinkedRegistryEntries = unlinkedRows.map(toUnlinkedRegistryEntry);
  const unobservedLinkedVessels = linkedRows.map((row) => {
    const latest = isoOrNull(row.latest_observed_at);
    const latestDate = latest ? new Date(latest) : null;
    return {
      vesselName: row.vessel_name,
      operator: row.operator,
      imo: row.imo,
      missing24h: !latestDate || latestDate < starts.last24h,
      missing7d: !latestDate || latestDate < starts.last7d,
      missing30d: !latestDate || latestDate < starts.last30d,
      latestObservedAt: latest
    };
  });

  return {
    summary: {
      generatedAt: now.toISOString(),
      acceptedRegistryEntries,
      publicEligibleVessels,
      linkedMmsiVessels,
      observed24h,
      observed7d,
      observed30d,
      publicEligibleRatio,
      observed24hRatio,
      observed7dRatio,
      observed30dRatio,
      pendingCandidates,
      pendingConflicts,
      totalConflicts,
      readinessStatus: readiness.status,
      recommendation: readiness.recommendation,
      blockers: readiness.blockers,
      caveats: readiness.caveats
    },
    unlinkedRegistryEntries,
    unobservedLinkedVessels,
    unobservedByOperator: summarizeUnobservedByOperator(unobservedLinkedVessels),
    operatorCoverage,
    inventoryReview: buildInventoryReview(inventoryRows),
    safetyChecks: {
      readOnlyCommand: true,
      databaseWritesAttempted: 0,
      importsApplied: false,
      mmsiCandidatesApproved: false,
      registryChanged: false
    }
  };
}

export function calculateRatio(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return numerator / denominator;
}

export function classifyLaunchReadiness(input: {
  publicEligibleRatio: number;
  observed7dRatio: number;
  pendingConflicts: number;
  totalConflicts: number;
  acceptedRegistryEntries: number;
  publicEligibleVessels: number;
}): { status: LaunchReadinessStatus; recommendation: LaunchRecommendation; blockers: string[]; caveats: string[] } {
  const blockers: string[] = [];
  const caveats: string[] = [];
  if (input.acceptedRegistryEntries === 0) blockers.push("No accepted registry baseline is available.");
  if (input.publicEligibleVessels === 0) blockers.push("No public-eligible verified vessels are available.");
  if (input.totalConflicts > 0) blockers.push(`Conflict records exist (${input.totalConflicts}); launch requires 0 conflicts.`);
  if (input.pendingConflicts > 0) blockers.push(`Pending conflict records exist (${input.pendingConflicts}); launch requires 0 pending conflicts.`);
  if (input.publicEligibleRatio < PUBLIC_ELIGIBLE_TARGET_RATIO) {
    blockers.push(`Public-eligible ratio is ${formatPercent(input.publicEligibleRatio)}, below the ${formatPercent(PUBLIC_ELIGIBLE_TARGET_RATIO)} target.`);
  }
  if (input.observed7dRatio < OBSERVED_7D_TARGET_RATIO) {
    caveats.push(`7-day observation ratio is ${formatPercent(input.observed7dRatio)}, below the ${formatPercent(OBSERVED_7D_TARGET_RATIO)} operating target.`);
  }

  if (blockers.some((blocker) => blocker.includes("Conflict"))) {
    return { status: "not ready", recommendation: "fix data/model issue first", blockers, caveats };
  }
  if (input.publicEligibleRatio < PUBLIC_ELIGIBLE_TARGET_RATIO) {
    return { status: "beta ready", recommendation: "wait for more MMSI candidates", blockers, caveats };
  }
  if (input.observed7dRatio < OBSERVED_7D_TARGET_RATIO) {
    return { status: "public ready with caveats", recommendation: "live now as beta", blockers, caveats };
  }
  return { status: "public ready", recommendation: "live now as beta", blockers, caveats };
}

export function summarizeUnobservedByOperator(rows: UnobservedLinkedVessel[]) {
  const grouped = new Map<string, { operator: string; missing24h: number; missing7d: number; missing30d: number }>();
  for (const row of rows) {
    const current = grouped.get(row.operator) ?? { operator: row.operator, missing24h: 0, missing7d: 0, missing30d: 0 };
    if (row.missing24h) current.missing24h += 1;
    if (row.missing7d) current.missing7d += 1;
    if (row.missing30d) current.missing30d += 1;
    grouped.set(row.operator, current);
  }
  return [...grouped.values()].sort((a, b) => b.missing30d - a.missing30d || b.missing7d - a.missing7d || a.operator.localeCompare(b.operator));
}

export function parseLaunchInventory(path: string): InventoryReviewRow[] {
  if (!existsSync(path)) return [];
  const rows = parseCsv(readFileSync(path, "utf8"));
  return rows.map((row) => ({
    operator: getCsv(row, "operator"),
    parentGroup: getCsv(row, "parent_group", "parentGroup"),
    status: getCsv(row, "completeness_status", "status"),
    officialFleetCount: nullableNumber(getCsv(row, "official_fleet_count", "officialFleetCount")),
    currentRegistryCount: nullableNumber(getCsv(row, "current_registry_count", "currentRegistryCount")),
    approvedMmsiLinkedCount: nullableNumber(getCsv(row, "approved_mmsi_linked_count", "approvedMmsiLinkedCount")),
    unresolvedCount: nullableNumber(getCsv(row, "unresolved_count", "unresolvedCount")) ?? 0,
    excludedCount: nullableNumber(getCsv(row, "excluded_count", "excludedCount")) ?? 0,
    thirdWaveReadyCount: nullableNumber(getCsv(row, "third_wave_ready_count", "thirdWaveReadyCount")) ?? 0,
    nextAction: getCsv(row, "next_action", "nextAction") || null
  }));
}

export function buildInventoryReview(rows: InventoryReviewRow[]) {
  const partialOperators = rows.filter((row) => /PARTIAL|NEEDS_SOURCE|IDENTITY_AUDIT/i.test(row.status));
  const scopeDecisionOperators = rows.filter((row) => /SCOPE_DECISION/i.test(row.status));
  const futureExcludedOperators = rows.filter((row) => /FUTURE_SHIPS_EXCLUDED/i.test(row.status));
  const outOfScopeOperators = rows.filter((row) => /OUT_OF_SCOPE/i.test(row.status));
  return {
    partialOperators,
    scopeDecisionOperators,
    futureExcludedOperators,
    outOfScopeOperators,
    estimatedAdditionalSafeRegistryPotential: rows.reduce((sum, row) => sum + getRemainingReadyPotential(row), 0),
    estimatedVesselsToRemainExcluded: rows.reduce((sum, row) => sum + row.excludedCount, 0)
  };
}

export function enrichInventoryWithLiveCounts(rows: InventoryReviewRow[], liveAcceptedByOperator: Map<string, number>) {
  return rows.map((row) => {
    const liveAccepted = liveAcceptedByOperator.get(row.operator);
    if (liveAccepted === undefined) return row;
    const csvRegistryCount = row.currentRegistryCount ?? 0;
    const importedSinceInventory = Math.max(0, liveAccepted - csvRegistryCount);
    return {
      ...row,
      currentRegistryCount: Math.max(csvRegistryCount, liveAccepted),
      thirdWaveReadyCount: Math.max(0, row.thirdWaveReadyCount - importedSinceInventory)
    };
  });
}

export function formatCruiseLaunchReadinessTerminal(report: LaunchReadinessReport) {
  return [
    "Cruise registry launch readiness audit",
    `Generated: ${report.summary.generatedAt}`,
    "",
    "Summary",
    tableLines([
      ["accepted registry entries", report.summary.acceptedRegistryEntries],
      ["public eligible vessels", report.summary.publicEligibleVessels],
      ["linked MMSI vessels", report.summary.linkedMmsiVessels],
      ["observed last 24h", report.summary.observed24h],
      ["observed last 7d", report.summary.observed7d],
      ["observed last 30d", report.summary.observed30d],
      ["public eligible ratio", formatPercent(report.summary.publicEligibleRatio)],
      ["24h observation ratio", formatPercent(report.summary.observed24hRatio)],
      ["7d observation ratio", formatPercent(report.summary.observed7dRatio)],
      ["30d observation ratio", formatPercent(report.summary.observed30dRatio)],
      ["pending candidates", report.summary.pendingCandidates],
      ["pending conflicts", report.summary.pendingConflicts],
      ["total conflicts", report.summary.totalConflicts],
      ["readiness", report.summary.readinessStatus],
      ["recommendation", report.summary.recommendation],
      ["database writes attempted", 0]
    ]),
    "",
    `Unlinked accepted registry entries: ${report.unlinkedRegistryEntries.length}`,
    `Public-eligible linked vessels unobserved in 7d: ${report.unobservedLinkedVessels.filter((row) => row.missing7d).length}`,
    `Partial inventory operators: ${report.inventoryReview.partialOperators.length}`,
    `Scope-decision operators: ${report.inventoryReview.scopeDecisionOperators.length}`,
    `Estimated additional safe registry potential: ${report.inventoryReview.estimatedAdditionalSafeRegistryPotential}`,
    `Estimated vessels to remain excluded: ${report.inventoryReview.estimatedVesselsToRemainExcluded}`,
    "",
    "Report written fields include vessel-level unlinked and unobserved tables."
  ].join("\n") + "\n";
}

export function formatCruiseLaunchReadinessMarkdown(report: LaunchReadinessReport) {
  const lines = [
    "# Cruise Registry Launch Readiness Audit",
    "",
    `Generated: \`${report.summary.generatedAt}\``,
    "",
    "## Registry Coverage Summary",
    markdownTable([
      ["Accepted registry entries", report.summary.acceptedRegistryEntries],
      ["Public eligible vessels", report.summary.publicEligibleVessels],
      ["Linked MMSI vessels", report.summary.linkedMmsiVessels],
      ["Vessels observed last 24h", report.summary.observed24h],
      ["Vessels observed last 7d", report.summary.observed7d],
      ["Vessels observed last 30d", report.summary.observed30d],
      ["Public eligible ratio", formatPercent(report.summary.publicEligibleRatio)],
      ["24h observation ratio", formatPercent(report.summary.observed24hRatio)],
      ["7d observation ratio", formatPercent(report.summary.observed7dRatio)],
      ["30d observation ratio", formatPercent(report.summary.observed30dRatio)],
      ["Pending candidates", report.summary.pendingCandidates],
      ["Pending conflicts", report.summary.pendingConflicts],
      ["Total conflicts", report.summary.totalConflicts]
    ]),
    "",
    "## Launch Readiness",
    markdownTable([
      ["Status", report.summary.readinessStatus],
      ["Recommendation", report.summary.recommendation],
      ["Public eligible target", formatPercent(PUBLIC_ELIGIBLE_TARGET_RATIO)],
      ["7d observation target", formatPercent(OBSERVED_7D_TARGET_RATIO)],
      ["Conflict target", "0"],
      ["Pending conflict target", "0"]
    ]),
    "",
    "### Blockers",
    ...bulletList(report.summary.blockers),
    "",
    "### Non-blocking Caveats",
    ...bulletList(report.summary.caveats),
    "",
    "## Unlinked Accepted Registry Entries",
    markdownRows(
      ["Vessel", "Operator", "IMO", "Active/status", "AIS candidate", "Latest candidate position", "Recommended action"],
      report.unlinkedRegistryEntries.map((row) => [
        row.vesselName,
        row.operator,
        row.imo,
        `${row.activeStatus} / ${row.inferredLifecycle}`,
        row.appearedInAisCandidateData ? `yes${row.candidateHasMmsi ? ", MMSI present" : ""}` : "no",
        row.latestCandidatePositionAt ?? "none",
        row.recommendedAction
      ])
    ),
    "",
    "## Unobserved Linked Vessels By Operator",
    markdownRows(
      ["Operator", "Missing 24h", "Missing 7d", "Missing 30d"],
      report.unobservedByOperator.map((row) => [row.operator, row.missing24h, row.missing7d, row.missing30d])
    ),
    "",
    "## Unobserved Linked Vessel Details",
    markdownRows(
      ["Vessel", "Operator", "IMO", "Missing 24h", "Missing 7d", "Missing 30d", "Latest observed"],
      report.unobservedLinkedVessels
        .filter((row) => row.missing24h || row.missing7d || row.missing30d)
        .map((row) => [
          row.vesselName,
          row.operator,
          row.imo,
          yesNo(row.missing24h),
          yesNo(row.missing7d),
          yesNo(row.missing30d),
          row.latestObservedAt ?? "never"
        ])
    ),
    "",
    "## Operator-Level Coverage",
    markdownRows(
      ["Operator", "Accepted", "Public eligible", "Eligible %", "Observed 7d", "Observed 30d", "Pending", "Conflicts", "Recommendation"],
      report.operatorCoverage.map((row) => [
        row.operator,
        row.acceptedRegistryCount,
        row.publicEligibleCount,
        formatPercent(row.publicEligibleRatio),
        row.observed7dCount,
        row.observed30dCount,
        row.pendingCandidatesCount,
        row.conflictsCount,
        row.recommendation
      ])
    ),
    "",
    "## Completeness Inventory Review",
    "",
    `Estimated additional vessels that could be added safely from proposal-ready inventory and are not already represented in the live registry: **${report.inventoryReview.estimatedAdditionalSafeRegistryPotential}**.`,
    "",
    `Estimated vessels that should remain excluded according to inventory scope decisions: **${report.inventoryReview.estimatedVesselsToRemainExcluded}**.`,
    "",
    "### Partial Operators",
    inventoryTable(report.inventoryReview.partialOperators),
    "",
    "### Scope Decision Required Operators",
    inventoryTable(report.inventoryReview.scopeDecisionOperators),
    "",
    "### Future Ships Excluded Operators",
    inventoryTable(report.inventoryReview.futureExcludedOperators),
    "",
    "### Out Of Scope Operators",
    inventoryTable(report.inventoryReview.outOfScopeOperators),
    "",
    "## Safety",
    markdownTable([
      ["Read-only command", "yes"],
      ["Database writes attempted", 0],
      ["Imports applied", "no"],
      ["MMSI candidates approved", "no"],
      ["Registry changed", "no"]
    ])
  ];
  return `${lines.join("\n")}\n`;
}

export function writeCruiseLaunchReadinessReport(path: string, report: LaunchReadinessReport) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, formatCruiseLaunchReadinessMarkdown(report), "utf8");
}

async function getSummaryRow(db: RawDb, starts: { last24h: Date; last7d: Date; last30d: Date }, now: Date) {
  const rows = await db.$queryRaw<SummaryRow[]>`
    WITH accepted AS (
      SELECT id, imo
      FROM cruise_vessel_registry_entries
      WHERE registry_decision = 'ACCEPT'
    ),
    public_eligible AS (
      SELECT DISTINCT r.id AS registry_entry_id, s.id AS ship_id, s.mmsi
      FROM accepted r
      INNER JOIN cruise_vessel_verifications v ON v.registry_entry_id = r.id
      INNER JOIN cruise_ships s ON s.id = v.ship_id
      WHERE v.verification_status = 'VERIFIED_OCEAN_CRUISE'
        AND v.confidence = 'HIGH'
        AND r.imo = s.imo
    ),
    observed AS (
      SELECT
        COUNT(DISTINCT pe.ship_id) FILTER (WHERE p.timestamp >= ${starts.last24h} AND p.timestamp <= ${now}) AS observed_24h,
        COUNT(DISTINCT pe.ship_id) FILTER (WHERE p.timestamp >= ${starts.last7d} AND p.timestamp <= ${now}) AS observed_7d,
        COUNT(DISTINCT pe.ship_id) FILTER (WHERE p.timestamp >= ${starts.last30d} AND p.timestamp <= ${now}) AS observed_30d
      FROM public_eligible pe
      INNER JOIN cruise_positions p ON p.ship_id = pe.ship_id
      WHERE p.latitude BETWEEN -90 AND 90
        AND p.longitude BETWEEN -180 AND 180
        AND NOT (p.latitude = 0 AND p.longitude = 0)
    ),
    queue AS (
      SELECT
        COUNT(*) FILTER (
          WHERE review_status = 'PENDING'
            AND classification = 'NEW_MMSI_CANDIDATE_FOR_EXISTING_REGISTRY_ENTRY'
        ) AS pending_candidates,
        COUNT(*) FILTER (
          WHERE review_status = 'PENDING'
            AND classification = 'MMSI_CONFLICT_REVIEW_REQUIRED'
        ) AS pending_conflicts,
        COUNT(*) FILTER (WHERE classification = 'MMSI_CONFLICT_REVIEW_REQUIRED') AS total_conflicts
      FROM cruise_static_data_review_queue
    )
    SELECT
      (SELECT COUNT(*) FROM accepted) AS accepted_registry_entries,
      (SELECT COUNT(DISTINCT ship_id) FROM public_eligible) AS public_eligible_vessels,
      (SELECT COUNT(DISTINCT ship_id) FROM public_eligible WHERE mmsi IS NOT NULL) AS linked_mmsi_vessels,
      COALESCE((SELECT observed_24h FROM observed), 0) AS observed_24h,
      COALESCE((SELECT observed_7d FROM observed), 0) AS observed_7d,
      COALESCE((SELECT observed_30d FROM observed), 0) AS observed_30d,
      COALESCE((SELECT pending_candidates FROM queue), 0) AS pending_candidates,
      COALESCE((SELECT pending_conflicts FROM queue), 0) AS pending_conflicts,
      COALESCE((SELECT total_conflicts FROM queue), 0) AS total_conflicts
  `;
  return rows[0] ?? {
    accepted_registry_entries: 0,
    public_eligible_vessels: 0,
    linked_mmsi_vessels: 0,
    observed_24h: 0,
    observed_7d: 0,
    observed_30d: 0,
    pending_candidates: 0,
    pending_conflicts: 0,
    total_conflicts: 0
  };
}

async function getUnlinkedRows(db: RawDb) {
  return db.$queryRaw<UnlinkedRow[]>`
    WITH public_eligible_registry AS (
      SELECT DISTINCT r.id AS registry_entry_id
      FROM cruise_vessel_registry_entries r
      INNER JOIN cruise_vessel_verifications v ON v.registry_entry_id = r.id
      INNER JOIN cruise_ships s ON s.id = v.ship_id
      WHERE r.registry_decision = 'ACCEPT'
        AND v.verification_status = 'VERIFIED_OCEAN_CRUISE'
        AND v.confidence = 'HIGH'
        AND r.imo = s.imo
        AND s.mmsi IS NOT NULL
    ),
    candidate_positions AS (
      SELECT ship_id, COUNT(*) AS position_count, MAX(timestamp) AS latest_position_at
      FROM cruise_positions
      GROUP BY ship_id
    )
    SELECT
      r.canonical_name AS vessel_name,
      r.operator,
      r.imo,
      r.source_name,
      r.registry_decision::text || '/' || r.active_status::text AS source_status,
      r.active_status::text AS active_status,
      s.id AS candidate_ship_id,
      s.mmsi AS candidate_mmsi,
      COALESCE(cp.position_count, 0) AS candidate_position_count,
      cp.latest_position_at AS latest_candidate_position_at
    FROM cruise_vessel_registry_entries r
    LEFT JOIN public_eligible_registry pe ON pe.registry_entry_id = r.id
    LEFT JOIN cruise_ships s ON s.imo = r.imo
    LEFT JOIN candidate_positions cp ON cp.ship_id = s.id
    WHERE r.registry_decision = 'ACCEPT'
      AND pe.registry_entry_id IS NULL
    ORDER BY r.operator ASC, r.canonical_name ASC
  `;
}

async function getLinkedRows(db: RawDb) {
  return db.$queryRaw<UnobservedRow[]>`
    SELECT
      r.canonical_name AS vessel_name,
      r.operator,
      r.imo,
      MAX(p.timestamp) AS latest_observed_at
    FROM cruise_vessel_registry_entries r
    INNER JOIN cruise_vessel_verifications v ON v.registry_entry_id = r.id
    INNER JOIN cruise_ships s ON s.id = v.ship_id
    LEFT JOIN cruise_positions p ON p.ship_id = s.id
      AND p.latitude BETWEEN -90 AND 90
      AND p.longitude BETWEEN -180 AND 180
      AND NOT (p.latitude = 0 AND p.longitude = 0)
    WHERE r.registry_decision = 'ACCEPT'
      AND v.verification_status = 'VERIFIED_OCEAN_CRUISE'
      AND v.confidence = 'HIGH'
      AND r.imo = s.imo
      AND s.mmsi IS NOT NULL
    GROUP BY r.canonical_name, r.operator, r.imo
    ORDER BY r.operator ASC, r.canonical_name ASC
  `;
}

async function getOperatorRows(db: RawDb, starts: { last7d: Date; last30d: Date }, now: Date) {
  return db.$queryRaw<OperatorRow[]>`
    WITH accepted AS (
      SELECT id, imo, operator
      FROM cruise_vessel_registry_entries
      WHERE registry_decision = 'ACCEPT'
    ),
    public_eligible AS (
      SELECT DISTINCT r.operator, r.id AS registry_entry_id, s.id AS ship_id
      FROM accepted r
      INNER JOIN cruise_vessel_verifications v ON v.registry_entry_id = r.id
      INNER JOIN cruise_ships s ON s.id = v.ship_id
      WHERE v.verification_status = 'VERIFIED_OCEAN_CRUISE'
        AND v.confidence = 'HIGH'
        AND r.imo = s.imo
        AND s.mmsi IS NOT NULL
    ),
    operator_counts AS (
      SELECT
        a.operator,
        COUNT(DISTINCT a.id) AS accepted_registry_count,
        COUNT(DISTINCT pe.ship_id) AS public_eligible_count
      FROM accepted a
      LEFT JOIN public_eligible pe ON pe.registry_entry_id = a.id
      GROUP BY a.operator
    ),
    observed AS (
      SELECT
        pe.operator,
        COUNT(DISTINCT pe.ship_id) FILTER (WHERE p.timestamp >= ${starts.last7d} AND p.timestamp <= ${now}) AS observed_7d_count,
        COUNT(DISTINCT pe.ship_id) FILTER (WHERE p.timestamp >= ${starts.last30d} AND p.timestamp <= ${now}) AS observed_30d_count
      FROM public_eligible pe
      LEFT JOIN cruise_positions p ON p.ship_id = pe.ship_id
        AND p.latitude BETWEEN -90 AND 90
        AND p.longitude BETWEEN -180 AND 180
        AND NOT (p.latitude = 0 AND p.longitude = 0)
      GROUP BY pe.operator
    ),
    queue AS (
      SELECT
        r.operator,
        COUNT(*) FILTER (
          WHERE q.review_status = 'PENDING'
            AND q.classification = 'NEW_MMSI_CANDIDATE_FOR_EXISTING_REGISTRY_ENTRY'
        ) AS pending_candidates_count,
        COUNT(*) FILTER (WHERE q.classification = 'MMSI_CONFLICT_REVIEW_REQUIRED') AS conflicts_count
      FROM cruise_static_data_review_queue q
      INNER JOIN cruise_vessel_registry_entries r ON r.id = q.registry_entry_id
      GROUP BY r.operator
    )
    SELECT
      oc.operator,
      oc.accepted_registry_count,
      oc.public_eligible_count,
      COALESCE(o.observed_7d_count, 0) AS observed_7d_count,
      COALESCE(o.observed_30d_count, 0) AS observed_30d_count,
      COALESCE(q.pending_candidates_count, 0) AS pending_candidates_count,
      COALESCE(q.conflicts_count, 0) AS conflicts_count
    FROM operator_counts oc
    LEFT JOIN observed o ON o.operator = oc.operator
    LEFT JOIN queue q ON q.operator = oc.operator
    ORDER BY oc.accepted_registry_count DESC, oc.operator ASC
  `;
}

function toUnlinkedRegistryEntry(row: UnlinkedRow): UnlinkedRegistryEntry {
  const activeStatus = row.active_status;
  const appeared = Boolean(row.candidate_ship_id);
  const candidateHasMmsi = Boolean(row.candidate_mmsi);
  const candidatePositionCount = numberFromCount(row.candidate_position_count);
  const inferredLifecycle = inferLifecycle(activeStatus, row.vessel_name);
  return {
    vesselName: row.vessel_name,
    operator: row.operator,
    imo: row.imo,
    sourceStatus: row.source_status,
    sourceName: row.source_name,
    activeStatus,
    appearedInAisCandidateData: appeared,
    candidateHasMmsi,
    candidatePositionCount,
    latestCandidatePositionAt: isoOrNull(row.latest_candidate_position_at),
    inferredLifecycle,
    recommendedAction: recommendUnlinkedAction({ inferredLifecycle, appeared, candidateHasMmsi, candidatePositionCount })
  };
}

function inferLifecycle(activeStatus: string, vesselName: string): UnlinkedRegistryEntry["inferredLifecycle"] {
  if (/RETIRED|SCRAPPED|INACTIVE/i.test(activeStatus)) return "inactive";
  if (/future|not active|delivery|under construction/i.test(vesselName)) return "future";
  if (/ACTIVE/i.test(activeStatus)) return "active";
  return "uncertain";
}

function recommendUnlinkedAction(input: {
  inferredLifecycle: UnlinkedRegistryEntry["inferredLifecycle"];
  appeared: boolean;
  candidateHasMmsi: boolean;
  candidatePositionCount: number;
}): UnlinkedRegistryEntry["recommendedAction"] {
  if (input.inferredLifecycle === "inactive" || input.inferredLifecycle === "future") return "exclude/out-of-scope candidate";
  if (!input.appeared) return "wait for AIS";
  if (input.candidateHasMmsi || input.candidatePositionCount > 0) return "investigate manually";
  return "needs source verification";
}

function toOperatorCoverageRow(row: OperatorRow, _totalAccepted: number): OperatorCoverageRow {
  const accepted = numberFromCount(row.accepted_registry_count);
  const eligible = numberFromCount(row.public_eligible_count);
  const observed7d = numberFromCount(row.observed_7d_count);
  const observed30d = numberFromCount(row.observed_30d_count);
  const pending = numberFromCount(row.pending_candidates_count);
  const conflicts = numberFromCount(row.conflicts_count);
  const eligibleRatio = calculateRatio(eligible, accepted);
  const unlinked = Math.max(0, accepted - eligible);
  return {
    operator: row.operator,
    acceptedRegistryCount: accepted,
    publicEligibleCount: eligible,
    publicEligibleRatio: eligibleRatio,
    observed7dCount: observed7d,
    observed30dCount: observed30d,
    pendingCandidatesCount: pending,
    conflictsCount: conflicts,
    unlinkedCount: unlinked,
    recommendation: recommendOperator({ accepted, eligibleRatio, observed7d, pending, conflicts, unlinked })
  };
}

function recommendOperator(input: {
  accepted: number;
  eligibleRatio: number;
  observed7d: number;
  pending: number;
  conflicts: number;
  unlinked: number;
}) {
  if (input.conflicts > 0) return "Resolve MMSI conflict before launch.";
  if (input.pending > 0) return "Review pending MMSI candidates.";
  if (input.accepted > 0 && input.eligibleRatio < PUBLIC_ELIGIBLE_TARGET_RATIO) return "Improve MMSI linkage coverage.";
  if (input.observed7d === 0) return "Monitor AIS; no linked vessels observed in 7d.";
  if (input.unlinked > 0) return "Launch acceptable if module remains beta; continue linkage.";
  return "Launch-ready for current registry baseline.";
}

function numberFromCount(value: CountRow["count"]) {
  return Number(value ?? 0);
}

function isoOrNull(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function nullableNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getRemainingReadyPotential(row: InventoryReviewRow) {
  return Math.max(0, row.thirdWaveReadyCount);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function yesNo(value: boolean) {
  return value ? "yes" : "no";
}

function bulletList(items: string[]) {
  return items.length ? items.map((item) => `- ${item}`) : ["- None."];
}

function inventoryTable(rows: InventoryReviewRow[]) {
  return markdownRows(
    ["Operator", "Status", "Fleet count", "Registry count", "Unresolved", "Excluded", "Next action"],
    rows.map((row) => [
      row.operator,
      row.status,
      row.officialFleetCount ?? "unknown",
      row.currentRegistryCount ?? "unknown",
      row.unresolvedCount,
      row.excludedCount,
      row.nextAction ?? "none"
    ])
  );
}

function markdownTable(rows: Array<Array<string | number>>) {
  return markdownRows(["Metric", "Value"], rows);
}

function markdownRows(headers: string[], rows: Array<Array<string | number>>) {
  if (!rows.length) return "_None._";
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map((value) => escapeMarkdownCell(String(value))).join(" | ")} |`)
  ].join("\n");
}

function tableLines(rows: Array<[string, string | number]>) {
  return rows.map(([key, value]) => `  ${key}: ${value}`).join("\n");
}

function escapeMarkdownCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function parseCsv(content: string): Array<Record<string, string>> {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce<Record<string, string>>((row, header, index) => {
      row[header] = values[index] ?? "";
      return row;
    }, {});
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
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function getCsv(row: Record<string, string>, ...names: string[]) {
  for (const name of names) {
    const key = Object.keys(row).find((candidate) => normalizeHeader(candidate) === normalizeHeader(name));
    if (key) return row[key]?.trim() ?? "";
  }
  return "";
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
