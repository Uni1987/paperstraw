import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { prisma } from "@/lib/prisma";

export type GlobalLocalFilterStatusFormat = "terminal" | "json" | "markdown";

export type GlobalLocalFilterStatusOptions = {
  sinceHours: number;
  format: GlobalLocalFilterStatusFormat;
  output?: string;
  force: boolean;
  includeReviewDetails: boolean;
  includeVesselDetails: boolean;
  now?: Date;
};

export type GlobalLocalFilterStatusCliOptions = GlobalLocalFilterStatusOptions & {
  output?: string;
};

export type CountByLabel = {
  label: string;
  count: number;
};

export type ObservedPositionSummaryInput = {
  shipId: string;
  timestamp: Date;
  latitude: number;
  longitude: number;
};

export type SafeReviewDetail = {
  id: string;
  classification: string;
  reviewStatus: string;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  occurrenceCount: number;
};

export type SafeVesselDetail = {
  label: string;
  positionCount: number;
  latestObservedAt: string | null;
};

export type GlobalLocalFilterStatusReport = {
  generatedAt: string;
  sinceHours: number;
  windowStart: string;
  windowEnd: string;
  grouping: "hour" | "day";
  registry: {
    acceptedRegistryEntries: number;
    verifiedPublicEligibleVessels: number;
    verifiedMmsisLoaded: number;
    verifiedVesselsWithLinkedMmsi: number;
    verifiedVesselsObservedLast24h: number;
    verifiedVesselsObservedLast7d: number;
    verifiedVesselsWithStoredPositions: number;
    verifiedVesselsWithStoredPositionsInWindow: number;
    verifiedVesselsWithDailyEstimatesForWindowUtcDays: number;
  };
  positions: {
    totalStoredCruisePositions: number;
    distinctVerifiedVesselsWithStoredPositions: number;
    earliestStoredPositionAt: string | null;
    latestStoredPositionAt: string | null;
    invalidOrMissingCoordinatePositions: number;
    grouped: CountByLabel[];
  };
  reviewQueue: {
    totalRecords: number;
    pendingRecords: number;
    reviewedRecords: number;
    dismissedRecords: number;
    alreadyLinkedConfirmationCount: number;
    newMmsiCandidateCount: number;
    mmsiConflictCount: number;
    recordsCreatedInWindow: number;
    recordsUpdatedInWindow: number;
    pendingMmsiReviewCandidates: number;
    pendingMmsiConflicts: number;
    oldestPendingAt: string | null;
    newestPendingAt: string | null;
    details?: SafeReviewDetail[];
  };
  emissions: {
    estimateDateWindow: {
      dailyEstimateRows: number;
      distinctVerifiedVessels: number;
      earliestEstimateDate: string | null;
      latestEstimateDate: string | null;
    };
    utcCalendarDaysCoveredByWindow: {
      start: string;
      endExclusive: string;
      dailyEstimateRows: number;
      distinctVerifiedVessels: number;
      earliestEstimateDate: string | null;
      latestEstimateDate: string | null;
    };
    writeActivity: {
      available: boolean;
      reason: string | null;
      rowsCreatedOrUpdatedInWindow: number | null;
      distinctVerifiedVesselsCreatedOrUpdatedInWindow: number | null;
      earliestWriteActivityAt: string | null;
      latestWriteActivityAt: string | null;
    };
  };
  safetyChecks: {
    readOnlyCommand: true;
    databaseWritesAttempted: 0;
    autoLinkingPerformed: false;
    reconcileOrImportApplied: false;
    pendingReviewCandidateExists: boolean;
    conflictExists: boolean;
    identityFieldsHiddenByDefault: boolean;
  };
  vesselDetails?: SafeVesselDetail[];
};

type RawDb = {
  $queryRaw: <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
  $queryRawUnsafe: <T = unknown>(query: string, ...values: unknown[]) => Promise<T>;
};

type CountRow = { count: number | bigint | string | null };
type TableStatusRow = {
  ships_exists: boolean;
  positions_exists: boolean;
  estimates_exists: boolean;
  registry_exists: boolean;
  verification_exists: boolean;
  queue_exists: boolean;
  estimates_created_at_exists: boolean;
  estimates_updated_at_exists: boolean;
};

const DEFAULT_OPTIONS = {
  sinceHours: 24,
  format: "terminal" as const,
  force: false,
  includeReviewDetails: false,
  includeVesselDetails: false
};

export function parseGlobalLocalFilterStatusArgs(argv: string[]): GlobalLocalFilterStatusCliOptions {
  const options: GlobalLocalFilterStatusCliOptions = { ...DEFAULT_OPTIONS };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    } else if (arg === "--since-hours") {
      options.sinceHours = parsePositiveNumber(argv[++index], "--since-hours");
    } else if (arg === "--format") {
      options.format = parseFormat(argv[++index]);
    } else if (arg === "--output") {
      const output = argv[++index];
      if (!output) throw new Error("--output requires a path.");
      options.output = output;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--include-review-details") {
      options.includeReviewDetails = true;
    } else if (arg === "--include-vessel-details") {
      options.includeVesselDetails = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.output && options.format === "terminal") {
    throw new Error("--output requires --format json or --format markdown.");
  }

  return options;
}

export function assertCanWriteStatusOutput(outputPath: string, force: boolean, fileExists = existsSync) {
  if (fileExists(outputPath) && !force) {
    throw new Error(`Output file already exists: ${outputPath}. Re-run with --force to overwrite it.`);
  }
}

export async function buildGlobalLocalFilterStatusReport(
  options: GlobalLocalFilterStatusOptions,
  db: RawDb = prisma
): Promise<GlobalLocalFilterStatusReport> {
  const now = options.now ?? new Date();
  const windowStart = new Date(now.getTime() - options.sinceHours * 60 * 60 * 1000);
  const last24hStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7dStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const utcDayRange = getUtcDayRangeForStatusWindow(windowStart, now);
  const grouping = options.sinceHours <= 72 ? "hour" : "day";
  const tables = await getTableStatus(db);

  const [
    acceptedRegistryEntries,
    verifiedPublicEligibleVessels,
    verifiedMmsisLoaded,
    verifiedVesselsWithLinkedMmsi,
    verifiedVesselsObservedLast24h,
    verifiedVesselsObservedLast7d,
    verifiedVesselsWithStoredPositions,
    verifiedVesselsWithStoredPositionsInWindow,
    verifiedVesselsWithDailyEstimatesForWindowUtcDays,
    positionsSummary,
    positionGroups,
    reviewSummary,
    emissionsSummary,
    reviewDetails,
    vesselDetails
  ] = await Promise.all([
    tables.registry_exists ? count(db, `SELECT COUNT(*)::int AS count FROM cruise_vessel_registry_entries WHERE registry_decision = 'ACCEPT'`) : 0,
    hasStrictVerificationTables(tables) ? count(db, strictVerifiedCountSql()) : 0,
    hasStrictVerificationTables(tables) ? count(db, `${strictVerifiedCountSql()} AND s.mmsi IS NOT NULL`) : 0,
    hasStrictVerificationTables(tables) ? count(db, `${strictVerifiedCountSql()} AND s.mmsi IS NOT NULL`) : 0,
    hasPositionTables(tables) ? count(db, `${strictVerifiedValidPositionCountSql()} AND p.timestamp >= $1 AND p.timestamp <= $2`, last24hStart, now) : 0,
    hasPositionTables(tables) ? count(db, `${strictVerifiedValidPositionCountSql()} AND p.timestamp >= $1 AND p.timestamp <= $2`, last7dStart, now) : 0,
    hasPositionTables(tables) ? count(db, strictVerifiedValidPositionCountSql()) : 0,
    hasPositionTables(tables) ? count(db, `${strictVerifiedValidPositionCountSql()} AND p.timestamp >= $1 AND p.timestamp <= $2`, windowStart, now) : 0,
    hasEstimateTables(tables) ? count(db, `${strictVerifiedEstimateCountSql()} AND e.date >= $1 AND e.date < $2`, utcDayRange.start, utcDayRange.endExclusive) : 0,
    getPositionsSummary(db, tables, windowStart, now),
    getPositionGroups(db, tables, windowStart, now, grouping),
    getReviewQueueSummary(db, tables, windowStart, now),
    getEmissionsSummary(db, tables, windowStart, now, utcDayRange),
    options.includeReviewDetails ? getSafeReviewDetails(db, tables) : Promise.resolve(undefined),
    options.includeVesselDetails ? getSafeVesselDetails(db, tables, windowStart, now) : Promise.resolve(undefined)
  ]);

  return {
    generatedAt: now.toISOString(),
    sinceHours: options.sinceHours,
    windowStart: windowStart.toISOString(),
    windowEnd: now.toISOString(),
    grouping,
    registry: {
      acceptedRegistryEntries,
      verifiedPublicEligibleVessels,
      verifiedMmsisLoaded,
      verifiedVesselsWithLinkedMmsi,
      verifiedVesselsObservedLast24h,
      verifiedVesselsObservedLast7d,
      verifiedVesselsWithStoredPositions,
      verifiedVesselsWithStoredPositionsInWindow,
      verifiedVesselsWithDailyEstimatesForWindowUtcDays
    },
    positions: positionsSummary ? { ...positionsSummary, grouped: positionGroups } : emptyPositions(positionGroups),
    reviewQueue: {
      ...reviewSummary,
      ...(reviewDetails ? { details: reviewDetails } : {})
    },
    emissions: emissionsSummary,
    safetyChecks: {
      readOnlyCommand: true,
      databaseWritesAttempted: 0,
      autoLinkingPerformed: false,
      reconcileOrImportApplied: false,
      pendingReviewCandidateExists: reviewSummary.pendingRecords > 0,
      conflictExists: reviewSummary.mmsiConflictCount > 0,
      identityFieldsHiddenByDefault: !options.includeVesselDetails
    },
    ...(vesselDetails ? { vesselDetails } : {})
  };
}

export function formatGlobalLocalFilterStatusReport(report: GlobalLocalFilterStatusReport, format: GlobalLocalFilterStatusFormat) {
  if (format === "json") return `${JSON.stringify(report, null, 2)}\n`;
  if (format === "markdown") return formatMarkdown(report);
  return formatTerminal(report);
}

export function writeStatusOutput(outputPath: string, content: string, force: boolean) {
  assertCanWriteStatusOutput(outputPath, force);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content, "utf8");
}

export function outputContainsSensitiveCruiseIdentity(output: string) {
  return /\b\d{7}\b/.test(output) || /\b\d{9}\b/.test(output) || /raw_payload|rawPayload|AIS payload/i.test(output);
}

function parsePositiveNumber(value: string | undefined, name: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive number.`);
  return parsed;
}

function parseFormat(value: string | undefined): GlobalLocalFilterStatusFormat {
  if (value === "terminal" || value === "json" || value === "markdown") return value;
  throw new Error("--format must be terminal, json, or markdown.");
}

async function getTableStatus(db: RawDb) {
  const rows = await db.$queryRaw<TableStatusRow[]>`
    SELECT
      to_regclass('public.cruise_ships') IS NOT NULL AS ships_exists,
      to_regclass('public.cruise_positions') IS NOT NULL AS positions_exists,
      to_regclass('public.cruise_emissions_daily_estimates') IS NOT NULL AS estimates_exists,
      to_regclass('public.cruise_vessel_registry_entries') IS NOT NULL AS registry_exists,
      to_regclass('public.cruise_vessel_verifications') IS NOT NULL AS verification_exists,
      to_regclass('public.cruise_static_data_review_queue') IS NOT NULL AS queue_exists,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'cruise_emissions_daily_estimates'
          AND column_name = 'created_at'
      ) AS estimates_created_at_exists,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'cruise_emissions_daily_estimates'
          AND column_name = 'updated_at'
      ) AS estimates_updated_at_exists
  `;
  return (
    rows[0] ?? {
      ships_exists: false,
      positions_exists: false,
      estimates_exists: false,
      registry_exists: false,
      verification_exists: false,
      queue_exists: false,
      estimates_created_at_exists: false,
      estimates_updated_at_exists: false
    }
  );
}

function hasStrictVerificationTables(tables: TableStatusRow) {
  return tables.ships_exists && tables.registry_exists && tables.verification_exists;
}

function hasPositionTables(tables: TableStatusRow) {
  return hasStrictVerificationTables(tables) && tables.positions_exists;
}

function hasEstimateTables(tables: TableStatusRow) {
  return hasStrictVerificationTables(tables) && tables.estimates_exists;
}

function strictVerifiedWhereSql() {
  return `
    FROM cruise_ships s
    INNER JOIN cruise_vessel_verifications v ON v.ship_id = s.id
    INNER JOIN cruise_vessel_registry_entries r ON r.id = v.registry_entry_id
    WHERE v.verification_status = 'VERIFIED_OCEAN_CRUISE'
      AND v.confidence = 'HIGH'
      AND r.registry_decision = 'ACCEPT'
      AND r.imo = s.imo
  `;
}

function strictVerifiedCountSql() {
  return `SELECT COUNT(DISTINCT s.id)::int AS count ${strictVerifiedWhereSql()}`;
}

function strictVerifiedPositionCountSql() {
  return `
    SELECT COUNT(DISTINCT s.id)::int AS count
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

function strictVerifiedValidPositionCountSql() {
  return `
    ${strictVerifiedPositionCountSql()}
      AND p.latitude BETWEEN -90 AND 90
      AND p.longitude BETWEEN -180 AND 180
      AND NOT (p.latitude = 0 AND p.longitude = 0)
  `;
}

function strictVerifiedEstimateCountSql() {
  return `
    SELECT COUNT(DISTINCT s.id)::int AS count
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

async function count(db: RawDb, sql: string, ...values: unknown[]) {
  const rows = await db.$queryRawUnsafe<CountRow[]>(sql, ...values);
  return numberFromCount(rows[0]?.count);
}

function numberFromCount(value: CountRow["count"]) {
  return Number(value ?? 0);
}

async function getPositionsSummary(db: RawDb, tables: TableStatusRow, windowStart: Date, now: Date) {
  if (!hasPositionTables(tables)) return null;
  const rows = await db.$queryRawUnsafe<
    Array<{
      total_positions: number | bigint | string | null;
      distinct_vessels: number | bigint | string | null;
      invalid_positions: number | bigint | string | null;
      min_value: Date | string | null;
      max_value: Date | string | null;
    }>
  >(
    `
      SELECT
        COUNT(*)::int AS total_positions,
        COUNT(DISTINCT s.id)::int AS distinct_vessels,
        COUNT(*) FILTER (
          WHERE p.latitude IS NULL
             OR p.longitude IS NULL
             OR p.latitude < -90
             OR p.latitude > 90
             OR p.longitude < -180
             OR p.longitude > 180
             OR (p.latitude = 0 AND p.longitude = 0)
        )::int AS invalid_positions,
        MIN(p.timestamp) AS min_value,
        MAX(p.timestamp) AS max_value
      FROM cruise_positions p
      INNER JOIN cruise_ships s ON s.id = p.ship_id
      INNER JOIN cruise_vessel_verifications v ON v.ship_id = s.id
      INNER JOIN cruise_vessel_registry_entries r ON r.id = v.registry_entry_id
      WHERE v.verification_status = 'VERIFIED_OCEAN_CRUISE'
        AND v.confidence = 'HIGH'
        AND r.registry_decision = 'ACCEPT'
        AND r.imo = s.imo
        AND p.timestamp >= $1
        AND p.timestamp <= $2
    `,
    windowStart,
    now
  );
  const row = rows[0];
  return {
    totalStoredCruisePositions: Number(row?.total_positions ?? 0),
    distinctVerifiedVesselsWithStoredPositions: Number(row?.distinct_vessels ?? 0),
    earliestStoredPositionAt: isoOrNull(row?.min_value ?? null),
    latestStoredPositionAt: isoOrNull(row?.max_value ?? null),
    invalidOrMissingCoordinatePositions: Number(row?.invalid_positions ?? 0)
  };
}

async function getPositionGroups(db: RawDb, tables: TableStatusRow, windowStart: Date, now: Date, grouping: "hour" | "day"): Promise<CountByLabel[]> {
  if (!hasPositionTables(tables)) return [];
  const datePart = grouping === "hour" ? "hour" : "day";
  const rows = await db.$queryRawUnsafe<Array<{ bucket: Date | string; count: number | bigint | string }>>(
    `
      SELECT date_trunc('${datePart}', p.timestamp) AS bucket, COUNT(*)::int AS count
      FROM cruise_positions p
      INNER JOIN cruise_ships s ON s.id = p.ship_id
      INNER JOIN cruise_vessel_verifications v ON v.ship_id = s.id
      INNER JOIN cruise_vessel_registry_entries r ON r.id = v.registry_entry_id
      WHERE v.verification_status = 'VERIFIED_OCEAN_CRUISE'
        AND v.confidence = 'HIGH'
        AND r.registry_decision = 'ACCEPT'
        AND r.imo = s.imo
        AND p.timestamp >= $1
        AND p.timestamp <= $2
      GROUP BY bucket
      ORDER BY bucket ASC
    `,
    windowStart,
    now
  );
  return rows.map((row) => ({ label: isoOrNull(row.bucket) ?? "unknown", count: Number(row.count ?? 0) }));
}

async function getReviewQueueSummary(db: RawDb, tables: TableStatusRow, windowStart: Date, now: Date) {
  if (!tables.queue_exists) return emptyReviewQueue();
  const rows = await db.$queryRawUnsafe<
    Array<{
      total_records: number | bigint | string | null;
      pending_records: number | bigint | string | null;
      reviewed_records: number | bigint | string | null;
      dismissed_records: number | bigint | string | null;
      already_linked: number | bigint | string | null;
      new_candidate: number | bigint | string | null;
      conflict: number | bigint | string | null;
      created_window: number | bigint | string | null;
      updated_window: number | bigint | string | null;
      pending_new_candidate: number | bigint | string | null;
      pending_conflict: number | bigint | string | null;
      oldest_pending: Date | string | null;
      newest_pending: Date | string | null;
    }>
  >(
    `
      SELECT
        COUNT(*)::int AS total_records,
        COUNT(*) FILTER (WHERE review_status = 'PENDING')::int AS pending_records,
        COUNT(*) FILTER (WHERE review_status = 'REVIEWED')::int AS reviewed_records,
        COUNT(*) FILTER (WHERE review_status = 'DISMISSED')::int AS dismissed_records,
        COUNT(*) FILTER (WHERE classification = 'ALREADY_LINKED_CONFIRMATION')::int AS already_linked,
        COUNT(*) FILTER (WHERE classification = 'NEW_MMSI_CANDIDATE_FOR_EXISTING_REGISTRY_ENTRY')::int AS new_candidate,
        COUNT(*) FILTER (WHERE classification = 'MMSI_CONFLICT_REVIEW_REQUIRED')::int AS conflict,
        COUNT(*) FILTER (WHERE created_at >= $1 AND created_at <= $2)::int AS created_window,
        COUNT(*) FILTER (WHERE updated_at >= $1 AND updated_at <= $2)::int AS updated_window,
        COUNT(*) FILTER (
          WHERE review_status = 'PENDING'
            AND classification = 'NEW_MMSI_CANDIDATE_FOR_EXISTING_REGISTRY_ENTRY'
        )::int AS pending_new_candidate,
        COUNT(*) FILTER (
          WHERE review_status = 'PENDING'
            AND classification = 'MMSI_CONFLICT_REVIEW_REQUIRED'
        )::int AS pending_conflict,
        MIN(first_seen_at) FILTER (WHERE review_status = 'PENDING') AS oldest_pending,
        MAX(last_seen_at) FILTER (WHERE review_status = 'PENDING') AS newest_pending
      FROM cruise_static_data_review_queue
    `,
    windowStart,
    now
  );
  const row = rows[0];
  return {
    totalRecords: Number(row?.total_records ?? 0),
    pendingRecords: Number(row?.pending_records ?? 0),
    reviewedRecords: Number(row?.reviewed_records ?? 0),
    dismissedRecords: Number(row?.dismissed_records ?? 0),
    alreadyLinkedConfirmationCount: Number(row?.already_linked ?? 0),
    newMmsiCandidateCount: Number(row?.new_candidate ?? 0),
    mmsiConflictCount: Number(row?.conflict ?? 0),
    recordsCreatedInWindow: Number(row?.created_window ?? 0),
    recordsUpdatedInWindow: Number(row?.updated_window ?? 0),
    pendingMmsiReviewCandidates: Number(row?.pending_new_candidate ?? 0),
    pendingMmsiConflicts: Number(row?.pending_conflict ?? 0),
    oldestPendingAt: isoOrNull(row?.oldest_pending ?? null),
    newestPendingAt: isoOrNull(row?.newest_pending ?? null)
  };
}

export function summarizeObservedVerifiedPositions(rows: ObservedPositionSummaryInput[], now: Date) {
  const nowMs = now.getTime();
  const last24hStartMs = nowMs - 24 * 60 * 60 * 1000;
  const last7dStartMs = nowMs - 7 * 24 * 60 * 60 * 1000;
  const validRows = rows.filter((row) => {
    const timestampMs = row.timestamp.getTime();
    return (
      Number.isFinite(timestampMs) &&
      timestampMs <= nowMs &&
      Number.isFinite(row.latitude) &&
      Number.isFinite(row.longitude) &&
      row.latitude >= -90 &&
      row.latitude <= 90 &&
      row.longitude >= -180 &&
      row.longitude <= 180 &&
      !(row.latitude === 0 && row.longitude === 0)
    );
  });
  return {
    verifiedVesselsObservedLast24h: new Set(validRows.filter((row) => row.timestamp.getTime() >= last24hStartMs).map((row) => row.shipId)).size,
    verifiedVesselsObservedLast7d: new Set(validRows.filter((row) => row.timestamp.getTime() >= last7dStartMs).map((row) => row.shipId)).size,
    verifiedVesselsWithStoredPositions: new Set(validRows.map((row) => row.shipId)).size
  };
}

export function getUtcDayRangeForStatusWindow(windowStart: Date, now: Date) {
  const start = new Date(Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth(), windowStart.getUTCDate()));
  const endExclusive = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return { start, endExclusive };
}

export function summarizeEmissionStatusRows(
  rows: Array<{ shipId: string; estimateDate: Date; createdAt?: Date | null; updatedAt?: Date | null }>,
  windowStart: Date,
  now: Date
) {
  const utcDayRange = getUtcDayRangeForStatusWindow(windowStart, now);
  const estimateDateRows = rows.filter((row) => row.estimateDate >= windowStart && row.estimateDate <= now);
  const utcCalendarRows = rows.filter((row) => row.estimateDate >= utcDayRange.start && row.estimateDate < utcDayRange.endExclusive);
  const writeRows = rows.filter((row) => {
    const writeAt = row.updatedAt ?? row.createdAt ?? null;
    return writeAt !== null && writeAt >= windowStart && writeAt <= now;
  });

  return {
    estimateDateRows: estimateDateRows.length,
    estimateDateVessels: new Set(estimateDateRows.map((row) => row.shipId)).size,
    utcCalendarRows: utcCalendarRows.length,
    utcCalendarVessels: new Set(utcCalendarRows.map((row) => row.shipId)).size,
    writeRows: writeRows.length,
    writeVessels: new Set(writeRows.map((row) => row.shipId)).size
  };
}

async function getEmissionsSummary(db: RawDb, tables: TableStatusRow, windowStart: Date, now: Date, utcDayRange: { start: Date; endExclusive: Date }) {
  if (!hasEstimateTables(tables)) return emptyEmissions();
  const estimateDateRows = await db.$queryRawUnsafe<
    Array<{
      rows_count: number | bigint | string | null;
      distinct_vessels: number | bigint | string | null;
      min_value: Date | string | null;
      max_value: Date | string | null;
    }>
  >(
    `
      SELECT
        COUNT(*)::int AS rows_count,
        COUNT(DISTINCT s.id)::int AS distinct_vessels,
        MIN(e.date) AS min_value,
        MAX(e.date) AS max_value
      FROM cruise_emissions_daily_estimates e
      INNER JOIN cruise_ships s ON s.id = e.ship_id
      INNER JOIN cruise_vessel_verifications v ON v.ship_id = s.id
      INNER JOIN cruise_vessel_registry_entries r ON r.id = v.registry_entry_id
      WHERE v.verification_status = 'VERIFIED_OCEAN_CRUISE'
        AND v.confidence = 'HIGH'
        AND r.registry_decision = 'ACCEPT'
        AND r.imo = s.imo
        AND e.date >= $1
        AND e.date <= $2
    `,
    windowStart,
    now
  );
  const utcCalendarRows = await db.$queryRawUnsafe<
    Array<{
      rows_count: number | bigint | string | null;
      distinct_vessels: number | bigint | string | null;
      min_value: Date | string | null;
      max_value: Date | string | null;
    }>
  >(
    `
      SELECT
        COUNT(*)::int AS rows_count,
        COUNT(DISTINCT s.id)::int AS distinct_vessels,
        MIN(e.date) AS min_value,
        MAX(e.date) AS max_value
      FROM cruise_emissions_daily_estimates e
      INNER JOIN cruise_ships s ON s.id = e.ship_id
      INNER JOIN cruise_vessel_verifications v ON v.ship_id = s.id
      INNER JOIN cruise_vessel_registry_entries r ON r.id = v.registry_entry_id
      WHERE v.verification_status = 'VERIFIED_OCEAN_CRUISE'
        AND v.confidence = 'HIGH'
        AND r.registry_decision = 'ACCEPT'
        AND r.imo = s.imo
        AND e.date >= $1
        AND e.date < $2
    `,
    utcDayRange.start,
    utcDayRange.endExclusive
  );
  const writeActivity = await getEmissionWriteActivitySummary(db, tables, windowStart, now);
  const estimateRow = estimateDateRows[0];
  const utcRow = utcCalendarRows[0];
  return {
    estimateDateWindow: {
      dailyEstimateRows: Number(estimateRow?.rows_count ?? 0),
      distinctVerifiedVessels: Number(estimateRow?.distinct_vessels ?? 0),
      earliestEstimateDate: isoOrNull(estimateRow?.min_value ?? null),
      latestEstimateDate: isoOrNull(estimateRow?.max_value ?? null)
    },
    utcCalendarDaysCoveredByWindow: {
      start: utcDayRange.start.toISOString(),
      endExclusive: utcDayRange.endExclusive.toISOString(),
      dailyEstimateRows: Number(utcRow?.rows_count ?? 0),
      distinctVerifiedVessels: Number(utcRow?.distinct_vessels ?? 0),
      earliestEstimateDate: isoOrNull(utcRow?.min_value ?? null),
      latestEstimateDate: isoOrNull(utcRow?.max_value ?? null)
    },
    writeActivity
  };
}

async function getEmissionWriteActivitySummary(db: RawDb, tables: TableStatusRow, windowStart: Date, now: Date): Promise<GlobalLocalFilterStatusReport["emissions"]["writeActivity"]> {
  if (!tables.estimates_created_at_exists || !tables.estimates_updated_at_exists) {
    return {
      available: false,
      reason: "cruise_emissions_daily_estimates has no created_at/updated_at audit columns",
      rowsCreatedOrUpdatedInWindow: null,
      distinctVerifiedVesselsCreatedOrUpdatedInWindow: null,
      earliestWriteActivityAt: null,
      latestWriteActivityAt: null
    };
  }
  const rows = await db.$queryRawUnsafe<
    Array<{
      rows_count: number | bigint | string | null;
      distinct_vessels: number | bigint | string | null;
      min_value: Date | string | null;
      max_value: Date | string | null;
    }>
  >(
    `
      SELECT
        COUNT(*)::int AS rows_count,
        COUNT(DISTINCT s.id)::int AS distinct_vessels,
        MIN(GREATEST(e.created_at, e.updated_at)) AS min_value,
        MAX(GREATEST(e.created_at, e.updated_at)) AS max_value
      FROM cruise_emissions_daily_estimates e
      INNER JOIN cruise_ships s ON s.id = e.ship_id
      INNER JOIN cruise_vessel_verifications v ON v.ship_id = s.id
      INNER JOIN cruise_vessel_registry_entries r ON r.id = v.registry_entry_id
      WHERE v.verification_status = 'VERIFIED_OCEAN_CRUISE'
        AND v.confidence = 'HIGH'
        AND r.registry_decision = 'ACCEPT'
        AND r.imo = s.imo
        AND GREATEST(e.created_at, e.updated_at) >= $1
        AND GREATEST(e.created_at, e.updated_at) <= $2
    `,
    windowStart,
    now
  );
  const row = rows[0];
  return {
    available: true,
    reason: null,
    rowsCreatedOrUpdatedInWindow: Number(row?.rows_count ?? 0),
    distinctVerifiedVesselsCreatedOrUpdatedInWindow: Number(row?.distinct_vessels ?? 0),
    earliestWriteActivityAt: isoOrNull(row?.min_value ?? null),
    latestWriteActivityAt: isoOrNull(row?.max_value ?? null)
  };
}

async function getSafeReviewDetails(db: RawDb, tables: TableStatusRow): Promise<SafeReviewDetail[] | undefined> {
  if (!tables.queue_exists) return [];
  const rows = await db.$queryRawUnsafe<
    Array<{
      id: string;
      classification: string;
      review_status: string;
      first_seen_at: Date | string | null;
      last_seen_at: Date | string | null;
      occurrence_count: number | bigint | string | null;
    }>
  >(
    `
      SELECT id, classification::text, review_status::text, first_seen_at, last_seen_at, occurrence_count
      FROM cruise_static_data_review_queue
      ORDER BY last_seen_at DESC
      LIMIT 50
    `
  );
  return rows.map((row) => ({
    id: row.id,
    classification: row.classification,
    reviewStatus: row.review_status,
    firstSeenAt: isoOrNull(row.first_seen_at),
    lastSeenAt: isoOrNull(row.last_seen_at),
    occurrenceCount: Number(row.occurrence_count ?? 0)
  }));
}

async function getSafeVesselDetails(db: RawDb, tables: TableStatusRow, windowStart: Date, now: Date): Promise<SafeVesselDetail[] | undefined> {
  if (!hasPositionTables(tables)) return [];
  const rows = await db.$queryRawUnsafe<Array<{ position_count: number | bigint | string; latest_observed_at: Date | string | null }>>(
    `
      SELECT COUNT(*)::int AS position_count, MAX(p.timestamp) AS latest_observed_at
      FROM cruise_positions p
      INNER JOIN cruise_ships s ON s.id = p.ship_id
      INNER JOIN cruise_vessel_verifications v ON v.ship_id = s.id
      INNER JOIN cruise_vessel_registry_entries r ON r.id = v.registry_entry_id
      WHERE v.verification_status = 'VERIFIED_OCEAN_CRUISE'
        AND v.confidence = 'HIGH'
        AND r.registry_decision = 'ACCEPT'
        AND r.imo = s.imo
        AND p.timestamp >= $1
        AND p.timestamp <= $2
      GROUP BY s.id
      ORDER BY MAX(p.timestamp) DESC, COUNT(*) DESC
      LIMIT 25
    `,
    windowStart,
    now
  );
  return rows.map((row, index) => ({
    label: `Verified vessel #${index + 1}`,
    positionCount: Number(row.position_count ?? 0),
    latestObservedAt: isoOrNull(row.latest_observed_at)
  }));
}

function emptyPositions(grouped: CountByLabel[]) {
  return {
    totalStoredCruisePositions: 0,
    distinctVerifiedVesselsWithStoredPositions: 0,
    earliestStoredPositionAt: null,
    latestStoredPositionAt: null,
    invalidOrMissingCoordinatePositions: 0,
    grouped
  };
}

function emptyReviewQueue() {
  return {
    totalRecords: 0,
    pendingRecords: 0,
    reviewedRecords: 0,
    dismissedRecords: 0,
    alreadyLinkedConfirmationCount: 0,
    newMmsiCandidateCount: 0,
    mmsiConflictCount: 0,
    recordsCreatedInWindow: 0,
    recordsUpdatedInWindow: 0,
    pendingMmsiReviewCandidates: 0,
    pendingMmsiConflicts: 0,
    oldestPendingAt: null,
    newestPendingAt: null
  };
}

function emptyEmissions() {
  return {
    estimateDateWindow: {
      dailyEstimateRows: 0,
      distinctVerifiedVessels: 0,
      earliestEstimateDate: null,
      latestEstimateDate: null
    },
    utcCalendarDaysCoveredByWindow: {
      start: "",
      endExclusive: "",
      dailyEstimateRows: 0,
      distinctVerifiedVessels: 0,
      earliestEstimateDate: null,
      latestEstimateDate: null
    },
    writeActivity: {
      available: false,
      reason: "cruise_emissions_daily_estimates table is unavailable",
      rowsCreatedOrUpdatedInWindow: null,
      distinctVerifiedVesselsCreatedOrUpdatedInWindow: null,
      earliestWriteActivityAt: null,
      latestWriteActivityAt: null
    }
  };
}

function isoOrNull(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatTerminal(report: GlobalLocalFilterStatusReport) {
  const lines = [
    "Cruise global-local-filter status",
    `Window: last ${report.sinceHours} hour(s) (${report.windowStart} to ${report.windowEnd})`,
    "",
    "Registry / verification",
    tableLines([
      ["accepted registry entries", report.registry.acceptedRegistryEntries],
      ["verified public-eligible vessels", report.registry.verifiedPublicEligibleVessels],
      ["verified MMSIs loaded", report.registry.verifiedMmsisLoaded],
      ["verified vessels with linked MMSI", report.registry.verifiedVesselsWithLinkedMmsi],
      ["verified vessels observed last 24h", report.registry.verifiedVesselsObservedLast24h],
      ["verified vessels observed last 7d", report.registry.verifiedVesselsObservedLast7d],
      ["verified vessels with stored positions", report.registry.verifiedVesselsWithStoredPositions],
      ["verified vessels with stored positions in selected window", report.registry.verifiedVesselsWithStoredPositionsInWindow],
      ["verified vessels with daily estimates for UTC day(s)", report.registry.verifiedVesselsWithDailyEstimatesForWindowUtcDays]
    ]),
    "",
    "Position ingest",
    tableLines([
      ["stored verified cruise positions", report.positions.totalStoredCruisePositions],
      ["distinct verified vessels", report.positions.distinctVerifiedVesselsWithStoredPositions],
      ["earliest position", report.positions.earliestStoredPositionAt ?? "none"],
      ["latest position", report.positions.latestStoredPositionAt ?? "none"],
      ["invalid/missing coordinates", report.positions.invalidOrMissingCoordinatePositions]
    ]),
    "",
    "Review queue",
    tableLines([
      ["total queue records", report.reviewQueue.totalRecords],
      ["pending", report.reviewQueue.pendingRecords],
      ["reviewed", report.reviewQueue.reviewedRecords],
      ["dismissed", report.reviewQueue.dismissedRecords],
      ["already-linked confirmations", report.reviewQueue.alreadyLinkedConfirmationCount],
      ["new MMSI candidates", report.reviewQueue.newMmsiCandidateCount],
      ["MMSI conflicts", report.reviewQueue.mmsiConflictCount],
      ["pending MMSI review candidates", report.reviewQueue.pendingMmsiReviewCandidates],
      ["pending MMSI conflicts", report.reviewQueue.pendingMmsiConflicts],
      ["created in window", report.reviewQueue.recordsCreatedInWindow],
      ["updated in window", report.reviewQueue.recordsUpdatedInWindow]
    ]),
    "",
    "Emissions",
    tableLines([
      ["estimate-date rows in exact window", report.emissions.estimateDateWindow.dailyEstimateRows],
      ["estimate-date vessels in exact window", report.emissions.estimateDateWindow.distinctVerifiedVessels],
      ["earliest exact-window estimate date", report.emissions.estimateDateWindow.earliestEstimateDate ?? "none"],
      ["latest exact-window estimate date", report.emissions.estimateDateWindow.latestEstimateDate ?? "none"],
      ["UTC day coverage start", report.emissions.utcCalendarDaysCoveredByWindow.start || "none"],
      ["UTC day coverage end exclusive", report.emissions.utcCalendarDaysCoveredByWindow.endExclusive || "none"],
      ["UTC day estimate rows", report.emissions.utcCalendarDaysCoveredByWindow.dailyEstimateRows],
      ["UTC day estimate vessels", report.emissions.utcCalendarDaysCoveredByWindow.distinctVerifiedVessels],
      ["earliest UTC day estimate date", report.emissions.utcCalendarDaysCoveredByWindow.earliestEstimateDate ?? "none"],
      ["latest UTC day estimate date", report.emissions.utcCalendarDaysCoveredByWindow.latestEstimateDate ?? "none"],
      ["write activity audit available", report.emissions.writeActivity.available ? "yes" : "no"],
      ["created/updated rows in window", report.emissions.writeActivity.rowsCreatedOrUpdatedInWindow ?? "unavailable"],
      ["created/updated vessels in window", report.emissions.writeActivity.distinctVerifiedVesselsCreatedOrUpdatedInWindow ?? "unavailable"],
      ["write activity note", report.emissions.writeActivity.reason ?? "none"]
    ]),
    "",
    "Safety checks",
    tableLines([
      ["read-only command", "yes"],
      ["database writes attempted", 0],
      ["auto-linking performed", "no"],
      ["reconcile/import applied", "no"],
      ["pending review candidate exists", report.safetyChecks.pendingReviewCandidateExists ? "yes" : "no"],
      ["conflict exists", report.safetyChecks.conflictExists ? "yes" : "no"],
      ["identity fields hidden by default", report.safetyChecks.identityFieldsHiddenByDefault ? "yes" : "no"]
    ])
  ];
  appendDetails(lines, report);
  return `${lines.join("\n")}\n`;
}

function formatMarkdown(report: GlobalLocalFilterStatusReport) {
  const lines = [
    "# Cruise Global-Local-Filter Status",
    "",
    `Window: last ${report.sinceHours} hour(s), from \`${report.windowStart}\` to \`${report.windowEnd}\`.`,
    "",
    "## Registry / Verification",
    markdownTable([
      ["Accepted registry entries", report.registry.acceptedRegistryEntries],
      ["Verified public-eligible vessels", report.registry.verifiedPublicEligibleVessels],
      ["Verified MMSIs loaded", report.registry.verifiedMmsisLoaded],
      ["Verified vessels with linked MMSI", report.registry.verifiedVesselsWithLinkedMmsi],
      ["Verified vessels observed last 24h", report.registry.verifiedVesselsObservedLast24h],
      ["Verified vessels observed last 7d", report.registry.verifiedVesselsObservedLast7d],
      ["Verified vessels with stored positions", report.registry.verifiedVesselsWithStoredPositions],
      ["Verified vessels with stored positions in selected window", report.registry.verifiedVesselsWithStoredPositionsInWindow],
      ["Verified vessels with daily estimates for UTC day(s)", report.registry.verifiedVesselsWithDailyEstimatesForWindowUtcDays]
    ]),
    "",
    "## Position Ingest",
    markdownTable([
      ["Stored verified cruise positions", report.positions.totalStoredCruisePositions],
      ["Distinct verified vessels", report.positions.distinctVerifiedVesselsWithStoredPositions],
      ["Earliest position", report.positions.earliestStoredPositionAt ?? "none"],
      ["Latest position", report.positions.latestStoredPositionAt ?? "none"],
      ["Invalid/missing coordinates", report.positions.invalidOrMissingCoordinatePositions]
    ]),
    "",
    "## Review Queue",
    markdownTable([
      ["Total queue records", report.reviewQueue.totalRecords],
      ["Pending", report.reviewQueue.pendingRecords],
      ["Reviewed", report.reviewQueue.reviewedRecords],
      ["Dismissed", report.reviewQueue.dismissedRecords],
      ["Already-linked confirmations", report.reviewQueue.alreadyLinkedConfirmationCount],
      ["New MMSI candidates", report.reviewQueue.newMmsiCandidateCount],
      ["MMSI conflicts", report.reviewQueue.mmsiConflictCount],
      ["Pending MMSI review candidates", report.reviewQueue.pendingMmsiReviewCandidates],
      ["Pending MMSI conflicts", report.reviewQueue.pendingMmsiConflicts],
      ["Created in window", report.reviewQueue.recordsCreatedInWindow],
      ["Updated in window", report.reviewQueue.recordsUpdatedInWindow]
    ]),
    "",
    "## Emissions",
    markdownTable([
      ["Estimate-date rows in exact window", report.emissions.estimateDateWindow.dailyEstimateRows],
      ["Estimate-date vessels in exact window", report.emissions.estimateDateWindow.distinctVerifiedVessels],
      ["Earliest exact-window estimate date", report.emissions.estimateDateWindow.earliestEstimateDate ?? "none"],
      ["Latest exact-window estimate date", report.emissions.estimateDateWindow.latestEstimateDate ?? "none"],
      ["UTC day coverage start", report.emissions.utcCalendarDaysCoveredByWindow.start || "none"],
      ["UTC day coverage end exclusive", report.emissions.utcCalendarDaysCoveredByWindow.endExclusive || "none"],
      ["UTC day estimate rows", report.emissions.utcCalendarDaysCoveredByWindow.dailyEstimateRows],
      ["UTC day estimate vessels", report.emissions.utcCalendarDaysCoveredByWindow.distinctVerifiedVessels],
      ["Earliest UTC day estimate date", report.emissions.utcCalendarDaysCoveredByWindow.earliestEstimateDate ?? "none"],
      ["Latest UTC day estimate date", report.emissions.utcCalendarDaysCoveredByWindow.latestEstimateDate ?? "none"],
      ["Write activity audit available", report.emissions.writeActivity.available ? "yes" : "no"],
      ["Created/updated rows in window", report.emissions.writeActivity.rowsCreatedOrUpdatedInWindow ?? "unavailable"],
      ["Created/updated vessels in window", report.emissions.writeActivity.distinctVerifiedVesselsCreatedOrUpdatedInWindow ?? "unavailable"],
      ["Write activity note", report.emissions.writeActivity.reason ?? "none"]
    ]),
    "",
    "## Safety Checks",
    markdownTable([
      ["Read-only command", "yes"],
      ["Database writes attempted", 0],
      ["Auto-linking performed", "no"],
      ["Reconcile/import applied", "no"],
      ["Pending review candidate exists", report.safetyChecks.pendingReviewCandidateExists ? "yes" : "no"],
      ["Conflict exists", report.safetyChecks.conflictExists ? "yes" : "no"],
      ["Identity fields hidden by default", report.safetyChecks.identityFieldsHiddenByDefault ? "yes" : "no"]
    ])
  ];
  appendDetails(lines, report, true);
  return `${lines.join("\n")}\n`;
}

function appendDetails(lines: string[], report: GlobalLocalFilterStatusReport, markdown = false) {
  if (report.reviewQueue.details?.length) {
    lines.push("", markdown ? "## Review Details" : "Review details");
    lines.push(
      markdown
        ? markdownTable(report.reviewQueue.details.map((row) => [row.id, row.classification, row.reviewStatus, row.firstSeenAt ?? "none", row.lastSeenAt ?? "none", row.occurrenceCount]))
        : tableLines(report.reviewQueue.details.map((row) => [`${row.id} ${row.classification} ${row.reviewStatus}`, `${row.occurrenceCount} occurrence(s), last ${row.lastSeenAt ?? "none"}`]))
    );
  }
  if (report.vesselDetails?.length) {
    lines.push("", markdown ? "## Vessel Details" : "Vessel details");
    lines.push(
      markdown
        ? markdownTable(report.vesselDetails.map((row) => [row.label, row.positionCount, row.latestObservedAt ?? "none"]))
        : tableLines(report.vesselDetails.map((row) => [row.label, `${row.positionCount} position(s), latest ${row.latestObservedAt ?? "none"}`]))
    );
  }
}

function tableLines(rows: Array<[string, string | number | boolean]>) {
  return rows.map(([key, value]) => `  ${key}: ${value}`).join("\n");
}

function markdownTable(rows: Array<Array<string | number | boolean>>) {
  return ["| Metric | Value |", "| --- | --- |", ...rows.map(([key, value]) => `| ${key} | ${value} |`)].join("\n");
}
