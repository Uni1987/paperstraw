import { cache } from "react";
import { prisma } from "@/lib/database/cruises";
import { CRUISE_REGIONS, isCruisesEnabled } from "@/lib/cruises/config";
import { createPublicCruiseCache } from "@/lib/cruises/publicCache";
import {
  CRUISE_MAP_PERIODS,
  DEFAULT_CRUISE_MAP_PERIOD,
  parsePublicCruiseShipId,
  type CruiseMapPeriodId
} from "@/lib/cruises/publicInputs";
import { observePublicCruiseQuery } from "@/lib/cruises/queryObservability";

export {
  CRUISE_MAP_PERIODS,
  DEFAULT_CRUISE_MAP_PERIOD,
  normalizeCruiseMapPeriod,
  type CruiseMapPeriodId
} from "@/lib/cruises/publicInputs";

const reactCache = typeof cache === "function" ? cache : <T extends (...args: never[]) => unknown>(fn: T) => fn;

export const CRUISE_POSITION_FRESHNESS_WINDOW_HOURS = 6;
export const CRUISE_POSITION_FRESHNESS_WINDOW_MS = CRUISE_POSITION_FRESHNESS_WINDOW_HOURS * 60 * 60 * 1000;

export type CruiseRankRow = {
  shipId: string;
  shipName: string;
  operator: string;
  imo: string | null;
  mmsi: string | null;
  co2Tonnes: number;
  fuelTonnes: number;
  distanceNm: number;
};

export type CruiseDailyEmissionPoint = {
  date: string;
  label: string;
  estimatedCo2Tonnes: number;
};

export type CruiseBreakdownPoint = {
  label: string;
  estimatedCo2Tonnes: number;
  percent: number;
};

export type CruiseMapPoint = {
  shipId: string;
  name: string;
  operator: string;
  imo: string | null;
  mmsi: string;
  latitude: number;
  longitude: number;
  activityWeight: number;
  estimatedCo2Tonnes: number | null;
  speedOverGround: number | null;
  destination: string | null;
  timestamp: Date;
  isAggregate?: boolean;
  observationCount?: number;
  vesselCount?: number;
  periodLabel?: string;
  verificationStatus?: string | null;
};

export type CruiseMapPeriodPayload = {
  id: CruiseMapPeriodId;
  label: string;
  subtitle: string;
  legendTitle: string;
  points: CruiseMapPoint[];
};

export type CruisePositionRow = CruiseMapPoint;
export type CruiseMapMode = "activity" | "emissions";

export type CruiseEstimateInputRow = {
  shipId: string;
  date: Date;
  methodVersion: string;
  estimatedCo2Tonnes: unknown;
  estimatedFuelTonnes: unknown;
  distanceNm: unknown;
};

export type CruiseDataStatus = {
  source: string;
  latestPositionAt: Date | null;
  latestPositionExact: string | null;
  latestPositionRelative: string;
  currentlyTracked: number;
  verifiedShipsObservedLast24h: number;
  verifiedShipsWithStoredObservations: number;
  activeRegionCount: number;
  status: "Healthy" | "Awaiting data" | "Stale" | "Verification in progress";
  freshnessWindowHours: number;
  publicCoverage: string;
};

export type PublicCruiseEligibilityRecord = {
  verificationStatus: string | null | undefined;
  confidence: string | null | undefined;
  registryDecision: string | null | undefined;
  shipImo: string | null | undefined;
  registryImo: string | null | undefined;
};

type CruisePositionSqlRow = {
  shipId: string;
  name: string;
  operator: string | null;
  imo: string | null;
  mmsi: string;
  latitude: unknown;
  longitude: unknown;
  speedOverGround: unknown;
  destination: string | null;
  timestamp: Date;
  observationCount?: bigint | number | null;
  verificationStatus?: string | null;
  periodEstimatedCo2Tonnes?: unknown;
};

type CruisePeriodPositionSqlRow = CruisePositionSqlRow & {
  periodId: CruiseMapPeriodId;
};

type CruiseDailyAggregateSqlRow = {
  date: Date;
  estimatedCo2Tonnes: unknown;
  estimatedFuelTonnes: unknown;
  distanceNm: unknown;
  rowCount: bigint | number;
};

type CruiseShipAggregateSqlRow = {
  shipId: string;
  shipName: string;
  shipOperator: string | null;
  imo: string | null;
  mmsi: string | null;
  registryOperator: string | null;
  vesselSegment: string | null;
  estimatedCo2Tonnes: unknown;
  estimatedFuelTonnes: unknown;
  distanceNm: unknown;
};

type CruiseDashboardCoreStatsSqlRow = {
  positionStart: Date | null;
  estimateStart: Date | null;
  latestPositionAt: Date | null;
  verifiedShipsObservedLast24h: bigint | number;
  verifiedShipsWithStoredObservations: bigint | number;
};

export type CruiseActivityCellSqlRow = {
  latitude: unknown;
  longitude: unknown;
  observationCount: bigint | number;
  vesselCount: bigint | number;
  latestTimestamp: Date;
};

const getCruiseDashboardBaseData = reactCache(async () => {
  if (!isCruisesEnabled()) return { enabled: false as const };

  const now = new Date();
  const recentSince = new Date(now.getTime() - CRUISE_POSITION_FRESHNESS_WINDOW_MS);
  const observedLast24hSince = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const verifiedShipIds = await timeCruiseDataLoad("verified vessel lookup", getPublicVerifiedOceanCruiseShipIds);
  const [positions, coreStats] = await timeCruiseDataLoad("dashboard base queries", () =>
    Promise.all([
      getLatestCruisePositions(recentSince, now, verifiedShipIds),
      getCruiseDashboardCoreStats(verifiedShipIds, observedLast24hSince, now)
    ])
  );
  const monitoringStart = earliestDate(coreStats.positionStart, coreStats.estimateStart);
  return {
    enabled: true as const,
    now,
    verifiedShipIds,
    monitoringStart,
    positions,
    latestPosition: coreStats.latestPositionAt ? { timestamp: coreStats.latestPositionAt } : null,
    verifiedShipsObservedLast24h: coreStats.verifiedShipsObservedLast24h,
    verifiedShipsWithStoredObservations: coreStats.verifiedShipsWithStoredObservations
  };
});

async function getCruiseDashboardDataUncached() {
  const base = await getCruiseDashboardBaseData();
  if (!base.enabled) return base;

  const {
    now,
    verifiedShipIds,
    monitoringStart,
    positions,
    latestPosition,
    verifiedShipsObservedLast24h,
    verifiedShipsWithStoredObservations
  } = base;

  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrow = new Date(todayStart);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const [dailyAggregates, shipAggregates] = await timeCruiseDataLoad(
    "dashboard aggregate queries",
    () => Promise.all([
      getCruiseDailyEstimateAggregates(new Date(0), tomorrow, verifiedShipIds),
      getCruiseShipEstimateAggregates(new Date(0), tomorrow, verifiedShipIds)
    ])
  );
  const todayTotals = summarizeCruiseDailyAggregates(
    dailyAggregates.filter((row) => row.date.getTime() >= todayStart.getTime() && row.date.getTime() < tomorrow.getTime())
  );
  const sinceMonitoringTotals = summarizeCruiseDailyAggregates(dailyAggregates);
  const operatorSourceRows = shipAggregates.map(toCruiseRankRow);
  const topShipsByEstimatedCo2 = operatorSourceRows
    .filter((row) => row.co2Tonnes > 0)
    .sort((a, b) => b.co2Tonnes - a.co2Tonnes)
    .slice(0, 6);
  const registryMetadataByShipId = new Map(
    shipAggregates.map((metadata) => [
      metadata.shipId,
      { operator: metadata.registryOperator, vesselSegment: metadata.vesselSegment }
    ] as const)
  );
  const aggregateEstimateRows = shipAggregates.map(toAggregateEstimateInputRow);
  const operators = buildOperatorRows(operatorSourceRows, 12);
  const latestPositionAt = latestPosition?.timestamp ?? null;

  return {
    enabled: true as const,
    kpis: {
      co2TodayTonnes: todayTotals.co2Tonnes,
      co2SinceMonitoringBeganTonnes: sinceMonitoringTotals.co2Tonnes,
      trackedShips: positions.length,
      fuelTodayTonnes: todayTotals.fuelTonnes,
      activeRegionCount: CRUISE_REGIONS.length,
      hasTodayEstimates: todayTotals.rows > 0,
      hasSinceMonitoringBeganEstimates: sinceMonitoringTotals.rows > 0
    },
    dailyEmissionsSeries: buildDailyCruiseEmissionSeriesFromAggregates(dailyAggregates),
    topShipsByEstimatedCo2,
    operatorBreakdown: buildCruiseOperatorBreakdown(aggregateEstimateRows, registryMetadataByShipId),
    segmentBreakdown: buildCruiseSegmentBreakdown(aggregateEstimateRows, registryMetadataByShipId),
    operators,
    monitoringStart,
    sourceStatus: {
      source: "AISStream / EMSA THETIS-MRV",
      latestPositionAt,
      latestPositionExact: latestPositionAt ? formatDateTime(latestPositionAt) : null,
      latestPositionRelative: verifiedShipIds.length ? formatRelativeTime(latestPositionAt, now) : "No verified AIS positions yet",
      currentlyTracked: positions.length,
      verifiedShipsObservedLast24h,
      verifiedShipsWithStoredObservations,
      activeRegionCount: CRUISE_REGIONS.length,
      status: verifiedShipIds.length ? getCruiseDataStatus(latestPositionAt, now) : "Verification in progress",
      freshnessWindowHours: CRUISE_POSITION_FRESHNESS_WINDOW_HOURS,
      publicCoverage: verifiedShipIds.length ? `${verifiedShipIds.length.toLocaleString("en-US")} verified vessel(s)` : "No verified vessels yet"
    } satisfies CruiseDataStatus
  };
}

async function getCruiseDashboardMapDataUncached() {
  const base = await getCruiseDashboardBaseData();
  if (!base.enabled) return { enabled: false as const };

  const mapPeriods = await timeCruiseDataLoad("map period queries", () =>
    getCruiseMapPeriodPayloads(
      base.verifiedShipIds,
      base.monitoringStart,
      base.now
    )
  );
  return {
    enabled: true as const,
    mapPoints: buildCruiseActivityMapPoints(base.positions, []),
    mapPeriods,
    mapMode: "activity" as CruiseMapMode
  };
}

type CruiseDashboardDataResult = Awaited<ReturnType<typeof getCruiseDashboardDataUncached>>;
type CruiseDashboardMapDataResult = Awaited<ReturnType<typeof getCruiseDashboardMapDataUncached>>;

const getCachedCruiseDashboardData = createPublicCruiseCache<CruiseDashboardDataResult>({
  key: "dashboard",
  loader: getCruiseDashboardDataUncached,
  serialize: (value) => JSON.stringify(value),
  deserialize: deserializeCruiseDashboardData
});

const getCachedCruiseDashboardMapData = createPublicCruiseCache<CruiseDashboardMapDataResult>({
  key: "map",
  loader: getCruiseDashboardMapDataUncached,
  serialize: (value) => JSON.stringify(value),
  deserialize: deserializeCruiseDashboardMapData
});

export const getCruiseDashboardData = reactCache(getCachedCruiseDashboardData);
export const getCruiseDashboardMapData = reactCache(getCachedCruiseDashboardMapData);

export type CruisePublicDataSummary = {
  acceptedRegistryEntries: number;
  verifiedPublicEligibleVessels: number;
  verifiedVesselsObservedLast24h: number;
  verifiedVesselsObservedLast30d: number;
};

type CruisePublicDataSummarySqlRow = {
  acceptedRegistryEntries: number | bigint;
  verifiedPublicEligibleVessels: number | bigint;
  verifiedVesselsObservedLast24h: number | bigint;
  verifiedVesselsObservedLast30d: number | bigint;
};

const getCachedCruisePublicDataSummary = createPublicCruiseCache<CruisePublicDataSummary>({
  key: "data-summary",
  loader: getCruisePublicDataSummaryUncached,
  serialize: (value) => JSON.stringify(value),
  deserialize: (value) => JSON.parse(value) as CruisePublicDataSummary
});

export const getCruisePublicDataSummary = reactCache(getCachedCruisePublicDataSummary);

async function getCruisePublicDataSummaryUncached(): Promise<CruisePublicDataSummary> {
  if (!(await cruiseVerificationTablesAvailable())) return emptyCruisePublicDataSummary();
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const rows = await observePublicCruiseQuery("public-data-summary", () =>
    prisma.$queryRaw<CruisePublicDataSummarySqlRow[]>`
      WITH verified AS (
        SELECT s.id
        FROM cruise_ships s
        INNER JOIN cruise_vessel_verifications v ON v.ship_id = s.id
        INNER JOIN cruise_vessel_registry_entries r ON r.id = v.registry_entry_id
        WHERE v.verification_status = 'VERIFIED_OCEAN_CRUISE'
          AND v.confidence = 'HIGH'
          AND r.registry_decision = 'ACCEPT'
          AND r.imo = s.imo
      )
      SELECT
        (SELECT COUNT(*)::int FROM cruise_vessel_registry_entries WHERE registry_decision = 'ACCEPT') AS "acceptedRegistryEntries",
        (SELECT COUNT(*)::int FROM verified) AS "verifiedPublicEligibleVessels",
        (
          SELECT COUNT(DISTINCT p.ship_id)::int
          FROM cruise_positions p
          INNER JOIN verified v ON v.id = p.ship_id
          WHERE p.timestamp >= ${last24h}
            AND p.timestamp <= ${now}
            AND p.latitude BETWEEN -90 AND 90
            AND p.longitude BETWEEN -180 AND 180
            AND NOT (p.latitude = 0 AND p.longitude = 0)
        ) AS "verifiedVesselsObservedLast24h",
        (
          SELECT COUNT(DISTINCT p.ship_id)::int
          FROM cruise_positions p
          INNER JOIN verified v ON v.id = p.ship_id
          WHERE p.timestamp >= ${last30d}
            AND p.timestamp <= ${now}
            AND p.latitude BETWEEN -90 AND 90
            AND p.longitude BETWEEN -180 AND 180
            AND NOT (p.latitude = 0 AND p.longitude = 0)
        ) AS "verifiedVesselsObservedLast30d"
    `
  );
  return mapCruisePublicDataSummaryRow(rows[0]);
}

export function mapCruisePublicDataSummaryRow(row: CruisePublicDataSummarySqlRow | null | undefined): CruisePublicDataSummary {
  if (!row) return emptyCruisePublicDataSummary();
  return {
    acceptedRegistryEntries: Number(row.acceptedRegistryEntries ?? 0),
    verifiedPublicEligibleVessels: Number(row.verifiedPublicEligibleVessels ?? 0),
    verifiedVesselsObservedLast24h: Number(row.verifiedVesselsObservedLast24h ?? 0),
    verifiedVesselsObservedLast30d: Number(row.verifiedVesselsObservedLast30d ?? 0)
  };
}

function emptyCruisePublicDataSummary(): CruisePublicDataSummary {
  return {
    acceptedRegistryEntries: 0,
    verifiedPublicEligibleVessels: 0,
    verifiedVesselsObservedLast24h: 0,
    verifiedVesselsObservedLast30d: 0
  };
}

function deserializeCruiseDashboardData(value: string): CruiseDashboardDataResult {
  const parsed = JSON.parse(value) as CruiseDashboardDataResult;
  if (!parsed.enabled) return parsed;
  return {
    ...parsed,
    monitoringStart: cachedDateOrNull(parsed.monitoringStart),
    sourceStatus: {
      ...parsed.sourceStatus,
      latestPositionAt: cachedDateOrNull(parsed.sourceStatus.latestPositionAt)
    }
  };
}

function deserializeCruiseDashboardMapData(value: string): CruiseDashboardMapDataResult {
  const parsed = JSON.parse(value) as CruiseDashboardMapDataResult;
  if (!parsed.enabled) return parsed;
  return {
    ...parsed,
    mapPoints: parsed.mapPoints.map(reviveCruiseMapPoint),
    mapPeriods: parsed.mapPeriods.map((period) => ({
      ...period,
      points: period.points.map(reviveCruiseMapPoint)
    }))
  };
}

function reviveCruiseMapPoint(point: CruiseMapPoint) {
  return { ...point, timestamp: cachedDate(point.timestamp) };
}

function cachedDateOrNull(value: unknown) {
  return value === null || value === undefined ? null : cachedDate(value);
}

function cachedDate(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error("Cached Cruise data contains an invalid date.");
  return date;
}

export const getCruiseShipDetail = reactCache(async (shipId: string) => {
  if (!isCruisesEnabled()) return { enabled: false as const };
  const publicShipId = parsePublicCruiseShipId(shipId);
  if (!publicShipId) return { enabled: true as const, ship: null };

  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrow = new Date(todayStart);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const monitoringWindowStart = new Date(0);

  const verified = await observePublicCruiseQuery(
    "ship-eligibility",
    () => isPublicVerifiedOceanCruiseShipId(publicShipId),
    (eligible) => (eligible ? 1 : 0),
    "uncached"
  );
  if (!verified) return { enabled: true as const, ship: null };

  const [ship, latestPosition, today, sinceMonitoringBegan, annual] = await observePublicCruiseQuery(
    "ship-detail",
    () => Promise.all([
    prisma.cruiseShip.findUnique({
      where: { id: publicShipId },
      select: { id: true, name: true, operator: true, imo: true, mmsi: true, shipType: true }
    }),
    prisma.cruisePosition.findFirst({
      where: { shipId: publicShipId },
      orderBy: { timestamp: "desc" },
      select: { latitude: true, longitude: true, speedOverGround: true, destination: true, timestamp: true }
    }),
    prisma.cruiseEmissionsDailyEstimate.findFirst({
      where: { shipId: publicShipId, date: { gte: todayStart, lt: tomorrow } },
      orderBy: { date: "desc" },
      select: { estimatedCo2Tonnes: true }
    }),
    prisma.cruiseEmissionsDailyEstimate.aggregate({
      where: { shipId: publicShipId, date: { gte: monitoringWindowStart, lt: tomorrow } },
      _sum: { estimatedCo2Tonnes: true, estimatedFuelTonnes: true, estimatedNoxKg: true, estimatedSoxKg: true, distanceNm: true },
      _min: { date: true }
    }),
    prisma.cruiseEmissionsAnnual.findFirst({
      where: { shipId: publicShipId },
      orderBy: { reportingYear: "desc" },
      select: { annualCo2Tonnes: true }
    })
  ]),
    (rows) => rows.filter(Boolean).length,
    "uncached"
  );

  if (!ship) return { enabled: true as const, ship: null };

  return {
    enabled: true as const,
    ship,
    latestPosition,
    today,
    sinceMonitoringBegan: {
      co2Tonnes: Number(sinceMonitoringBegan._sum.estimatedCo2Tonnes ?? 0),
      fuelTonnes: Number(sinceMonitoringBegan._sum.estimatedFuelTonnes ?? 0),
      noxKg: Number(sinceMonitoringBegan._sum.estimatedNoxKg ?? 0),
      soxKg: Number(sinceMonitoringBegan._sum.estimatedSoxKg ?? 0),
      distanceNm: Number(sinceMonitoringBegan._sum.distanceNm ?? 0)
    },
    monitoringStart: sinceMonitoringBegan._min.date,
    annual
  };
});

async function getLatestCruisePositions(recentSince: Date, now = new Date(), verifiedShipIds: string[]): Promise<CruiseMapPoint[]> {
  if (!verifiedShipIds.length) return [];
  const rows = await prisma.$queryRaw<CruisePositionSqlRow[]>`
    SELECT DISTINCT ON (p.ship_id)
      p.ship_id AS "shipId",
      s.name AS "name",
      s.operator AS "operator",
      s.imo AS "imo",
      p.mmsi AS "mmsi",
      p.latitude AS "latitude",
      p.longitude AS "longitude",
      p.speed_over_ground AS "speedOverGround",
      p.destination AS "destination",
      p.timestamp AS "timestamp",
      v.verification_status AS "verificationStatus"
    FROM cruise_positions p
    INNER JOIN cruise_ships s ON s.id = p.ship_id
    LEFT JOIN cruise_vessel_verifications v ON v.ship_id = s.id
    WHERE p.timestamp >= ${recentSince}
      AND p.timestamp <= ${now}
      AND p.ship_id = ANY(${verifiedShipIds})
      AND p.latitude BETWEEN -90 AND 90
      AND p.longitude BETWEEN -180 AND 180
      AND NOT (p.latitude = 0 AND p.longitude = 0)
    ORDER BY p.ship_id, p.timestamp DESC, p.id DESC
  `;

  return selectLatestCruisePositionPerShip(
    rows.map((row) => ({
      shipId: row.shipId,
      name: row.name,
      operator: row.operator ?? "Unknown operator",
      imo: row.imo,
      mmsi: row.mmsi,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      speedOverGround: row.speedOverGround ? Number(row.speedOverGround) : null,
      destination: row.destination,
      timestamp: row.timestamp,
      activityWeight: 1,
      estimatedCo2Tonnes: null,
      verificationStatus: row.verificationStatus ?? null
    })),
    now,
    CRUISE_POSITION_FRESHNESS_WINDOW_MS
  );
}

async function getCruiseDailyEstimateAggregates(start: Date, end: Date, verifiedShipIds: string[]) {
  if (!verifiedShipIds.length) return [];
  return prisma.$queryRaw<CruiseDailyAggregateSqlRow[]>`
    SELECT
      e.date AS "date",
      SUM(e.estimated_co2_tonnes) AS "estimatedCo2Tonnes",
      SUM(COALESCE(e.estimated_fuel_tonnes, 0)) AS "estimatedFuelTonnes",
      SUM(e.distance_nm) AS "distanceNm",
      COUNT(*)::int AS "rowCount"
    FROM cruise_emissions_daily_estimates e
    WHERE e.ship_id = ANY(${verifiedShipIds})
      AND e.date >= ${start}
      AND e.date < ${end}
    GROUP BY e.date
    ORDER BY e.date ASC
  `;
}

async function getCruiseShipEstimateAggregates(start: Date, end: Date, verifiedShipIds: string[]) {
  if (!verifiedShipIds.length) return [];
  return prisma.$queryRaw<CruiseShipAggregateSqlRow[]>`
    SELECT
      s.id AS "shipId",
      s.name AS "shipName",
      s.operator AS "shipOperator",
      s.imo AS "imo",
      s.mmsi AS "mmsi",
      r.operator AS "registryOperator",
      r.vessel_segment AS "vesselSegment",
      SUM(e.estimated_co2_tonnes) AS "estimatedCo2Tonnes",
      SUM(COALESCE(e.estimated_fuel_tonnes, 0)) AS "estimatedFuelTonnes",
      SUM(e.distance_nm) AS "distanceNm"
    FROM cruise_emissions_daily_estimates e
    INNER JOIN cruise_ships s ON s.id = e.ship_id
    INNER JOIN cruise_vessel_verifications v ON v.ship_id = s.id
    INNER JOIN cruise_vessel_registry_entries r ON r.id = v.registry_entry_id
    WHERE s.id = ANY(${verifiedShipIds})
      AND e.date >= ${start}
      AND e.date < ${end}
      AND v.verification_status = 'VERIFIED_OCEAN_CRUISE'
      AND v.confidence = 'HIGH'
      AND r.registry_decision = 'ACCEPT'
      AND r.imo = s.imo
    GROUP BY s.id, s.name, s.operator, s.imo, s.mmsi, r.operator, r.vessel_segment
    ORDER BY SUM(e.estimated_co2_tonnes) DESC, s.id ASC
  `;
}

function summarizeCruiseDailyAggregates(rows: CruiseDailyAggregateSqlRow[]) {
  return rows.reduce(
    (summary, row) => ({
      rows: summary.rows + Number(row.rowCount ?? 0),
      co2Tonnes: summary.co2Tonnes + Number(row.estimatedCo2Tonnes ?? 0),
      fuelTonnes: summary.fuelTonnes + Number(row.estimatedFuelTonnes ?? 0),
      distanceNm: summary.distanceNm + Number(row.distanceNm ?? 0)
    }),
    { rows: 0, co2Tonnes: 0, fuelTonnes: 0, distanceNm: 0 }
  );
}

function buildDailyCruiseEmissionSeriesFromAggregates(rows: CruiseDailyAggregateSqlRow[]) {
  return buildDailyCruiseEmissionSeries(
    rows.map((row) => ({
      shipId: `daily:${row.date.toISOString()}`,
      date: row.date,
      methodVersion: "public-daily-aggregate",
      estimatedCo2Tonnes: row.estimatedCo2Tonnes,
      estimatedFuelTonnes: row.estimatedFuelTonnes,
      distanceNm: row.distanceNm
    }))
  );
}

function toCruiseRankRow(row: CruiseShipAggregateSqlRow): CruiseRankRow {
  return {
    shipId: row.shipId,
    shipName: row.shipName,
    operator: row.shipOperator ?? "Unknown operator",
    imo: row.imo,
    mmsi: row.mmsi,
    co2Tonnes: Number(row.estimatedCo2Tonnes ?? 0),
    fuelTonnes: Number(row.estimatedFuelTonnes ?? 0),
    distanceNm: Number(row.distanceNm ?? 0)
  };
}

function toAggregateEstimateInputRow(row: CruiseShipAggregateSqlRow): CruiseEstimateInputRow {
  return {
    shipId: row.shipId,
    date: new Date(0),
    methodVersion: "public-ship-aggregate",
    estimatedCo2Tonnes: row.estimatedCo2Tonnes,
    estimatedFuelTonnes: row.estimatedFuelTonnes,
    distanceNm: row.distanceNm
  };
}

async function timeCruiseDataLoad<T>(label: string, operation: () => Promise<T>): Promise<T> {
  return observePublicCruiseQuery(label, operation);
}

async function getCruiseDashboardCoreStats(
  verifiedShipIds: string[],
  observedLast24hSince: Date,
  now: Date
) {
  if (!verifiedShipIds.length) {
    return {
      positionStart: null,
      estimateStart: null,
      latestPositionAt: null,
      verifiedShipsObservedLast24h: 0,
      verifiedShipsWithStoredObservations: 0
    };
  }
  const rows = await prisma.$queryRaw<CruiseDashboardCoreStatsSqlRow[]>`
    WITH position_stats AS (
      SELECT
        MIN(p.timestamp) FILTER (
          WHERE p.latitude BETWEEN -90 AND 90
            AND p.longitude BETWEEN -180 AND 180
            AND NOT (p.latitude = 0 AND p.longitude = 0)
        ) AS position_start,
        MAX(p.timestamp) FILTER (
          WHERE p.latitude BETWEEN -90 AND 90
            AND p.longitude BETWEEN -180 AND 180
            AND NOT (p.latitude = 0 AND p.longitude = 0)
        ) AS latest_position_at,
        COUNT(DISTINCT p.ship_id) FILTER (
          WHERE p.timestamp >= ${observedLast24hSince}
            AND p.timestamp <= ${now}
            AND p.latitude BETWEEN -90 AND 90
            AND p.longitude BETWEEN -180 AND 180
            AND NOT (p.latitude = 0 AND p.longitude = 0)
        )::int AS observed_last_24h,
        COUNT(DISTINCT p.ship_id) FILTER (
          WHERE p.latitude BETWEEN -90 AND 90
            AND p.longitude BETWEEN -180 AND 180
            AND NOT (p.latitude = 0 AND p.longitude = 0)
        )::int AS observed_all_time
      FROM cruise_positions p
      WHERE p.ship_id = ANY(${verifiedShipIds})
    ),
    estimate_stats AS (
      SELECT MIN(e.date) AS estimate_start
      FROM cruise_emissions_daily_estimates e
      WHERE e.ship_id = ANY(${verifiedShipIds})
    )
    SELECT
      position_stats.position_start AS "positionStart",
      estimate_stats.estimate_start AS "estimateStart",
      position_stats.latest_position_at AS "latestPositionAt",
      position_stats.observed_last_24h AS "verifiedShipsObservedLast24h",
      position_stats.observed_all_time AS "verifiedShipsWithStoredObservations"
    FROM position_stats
    CROSS JOIN estimate_stats
  `;
  const row = rows[0];
  return {
    positionStart: row?.positionStart ?? null,
    estimateStart: row?.estimateStart ?? null,
    latestPositionAt: row?.latestPositionAt ?? null,
    verifiedShipsObservedLast24h: Number(row?.verifiedShipsObservedLast24h ?? 0),
    verifiedShipsWithStoredObservations: Number(row?.verifiedShipsWithStoredObservations ?? 0)
  };
}

export function earliestDate(...values: Array<Date | null | undefined>): Date | null {
  const dates = values.filter((value): value is Date => Boolean(value));
  return dates.sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
}

export function getCruiseMapPeriodRange(period: CruiseMapPeriodId, now = new Date(), monitoringStart: Date | null = null) {
  const end = now;
  if (period === "week") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const day = start.getUTCDay();
    const daysSinceMonday = (day + 6) % 7;
    start.setUTCDate(start.getUTCDate() - daysSinceMonday);
    return { start, end };
  }
  if (period === "month") {
    return { start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), end };
  }
  return { start: monitoringStart ?? end, end };
}

async function getCruiseMapPeriodPayloads(
  verifiedShipIds: string[],
  monitoringStart: Date | null,
  now: Date
): Promise<CruiseMapPeriodPayload[]> {
  if (!verifiedShipIds.length) return CRUISE_MAP_PERIODS.map((period) => ({ ...period, points: [] }));
  const ranges = CRUISE_MAP_PERIODS.map((period) => ({ period, ...getCruiseMapPeriodRange(period.id, now, monitoringStart) }));
  const [week, month, sinceMonitoring] = ranges;
  if (!week || !month || !sinceMonitoring) return CRUISE_MAP_PERIODS.map((period) => ({ ...period, points: [] }));

  const rows = await prisma.$queryRaw<CruisePeriodPositionSqlRow[]>`
    WITH period_ranges (period_id, start_at, end_at) AS (
      VALUES
        (${week.period.id}, ${week.start}, ${week.end}),
        (${month.period.id}, ${month.start}, ${month.end}),
        (${sinceMonitoring.period.id}, ${sinceMonitoring.start}, ${sinceMonitoring.end})
    ),
    period_positions AS (
      SELECT
        ranges.period_id,
        p.*,
        COUNT(*) OVER (PARTITION BY ranges.period_id, p.ship_id)::int AS observation_count
      FROM period_ranges ranges
      INNER JOIN cruise_positions p
        ON p.timestamp >= ranges.start_at
       AND p.timestamp <= ranges.end_at
      WHERE p.ship_id = ANY(${verifiedShipIds})
        AND p.latitude BETWEEN -90 AND 90
        AND p.longitude BETWEEN -180 AND 180
        AND NOT (p.latitude = 0 AND p.longitude = 0)
    ),
    period_estimates AS (
      SELECT
        ranges.period_id,
        e.ship_id,
        SUM(e.estimated_co2_tonnes) AS estimated_co2_tonnes
      FROM period_ranges ranges
      INNER JOIN cruise_emissions_daily_estimates e
        ON e.date >= ranges.start_at
       AND e.date < ranges.end_at
      WHERE e.ship_id = ANY(${verifiedShipIds})
      GROUP BY ranges.period_id, e.ship_id
    )
    SELECT DISTINCT ON (p.period_id, p.ship_id)
      p.period_id AS "periodId",
      p.ship_id AS "shipId",
      s.name AS "name",
      s.operator AS "operator",
      s.imo AS "imo",
      p.mmsi AS "mmsi",
      p.latitude AS "latitude",
      p.longitude AS "longitude",
      p.speed_over_ground AS "speedOverGround",
      p.destination AS "destination",
      p.timestamp AS "timestamp",
      p.observation_count AS "observationCount",
      v.verification_status AS "verificationStatus",
      estimates.estimated_co2_tonnes AS "periodEstimatedCo2Tonnes"
    FROM period_positions p
    INNER JOIN cruise_ships s ON s.id = p.ship_id
    LEFT JOIN cruise_vessel_verifications v ON v.ship_id = s.id
    LEFT JOIN period_estimates estimates
      ON estimates.period_id = p.period_id
     AND estimates.ship_id = p.ship_id
    ORDER BY p.period_id, p.ship_id, p.timestamp DESC, p.id DESC
  `;
  const rowsByPeriod = new Map<CruiseMapPeriodId, CruisePositionSqlRow[]>();
  for (const row of rows) {
    const periodRows = rowsByPeriod.get(row.periodId) ?? [];
    periodRows.push(row);
    rowsByPeriod.set(row.periodId, periodRows);
  }

  return ranges.map(({ period }) => ({
    ...period,
    points: buildCruisePeriodVesselMapPoints(rowsByPeriod.get(period.id) ?? [], period.label)
  }));
}

export function filterCruiseEstimateRowsForPeriod(
  rows: CruiseEstimateInputRow[],
  start: Date,
  end: Date
) {
  return rows.filter((row) => row.date.getTime() >= start.getTime() && row.date.getTime() < end.getTime());
}

export function buildCruisePeriodVesselMapPoints(rows: CruisePositionSqlRow[], periodLabel: string): CruiseMapPoint[] {
  return rows
    .map((row) => ({
      shipId: row.shipId,
      name: row.name || row.imo || row.mmsi || "Unknown cruise ship",
      operator: row.operator ?? "Unknown operator",
      imo: row.imo,
      mmsi: row.mmsi,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      speedOverGround: row.speedOverGround === null || row.speedOverGround === undefined ? null : Number(row.speedOverGround),
      destination: row.destination,
      timestamp: row.timestamp,
      activityWeight: 1,
      estimatedCo2Tonnes:
        Number(row.periodEstimatedCo2Tonnes ?? 0) > 0 ? Number(row.periodEstimatedCo2Tonnes) : null,
      isAggregate: false,
      observationCount: Number(row.observationCount ?? 1),
      vesselCount: 1,
      periodLabel,
      verificationStatus: row.verificationStatus ?? null
    }))
    .filter((point) => isValidCruiseCoordinate(point.latitude, point.longitude));
}

export function buildCruiseActivityCellPoints(rows: CruiseActivityCellSqlRow[], periodLabel: string): CruiseMapPoint[] {
  const maxObservations = Math.max(1, ...rows.map((row) => Number(row.observationCount)));
  return rows
    .map((row) => {
      const observationCount = Number(row.observationCount);
      const vesselCount = Number(row.vesselCount);
      return {
        shipId: "",
        name: "Verified cruise activity",
        operator: `${vesselCount.toLocaleString("en-US")} verified ship${vesselCount === 1 ? "" : "s"}`,
        imo: null,
        mmsi: "",
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        speedOverGround: null,
        destination: null,
        timestamp: row.latestTimestamp,
        activityWeight: Math.max(0.18, Math.sqrt(observationCount / maxObservations)),
        estimatedCo2Tonnes: null,
        isAggregate: true,
        observationCount,
        vesselCount,
        periodLabel,
        verificationStatus: null
      } satisfies CruiseMapPoint;
    })
    .filter((point) => isValidCruiseCoordinate(point.latitude, point.longitude));
}

function rankCruiseEstimateRows(rows: CruiseEstimateInputRow[], take: number): CruiseRankRow[] {
  const grouped = summarizeCruiseEstimateRowsByShip(rows);
  return [...grouped.values()].sort((a, b) => b.co2Tonnes - a.co2Tonnes).slice(0, take);
}

export function buildTopCruiseShipChartRows(rows: CruiseEstimateInputRow[], take = 6): CruiseRankRow[] {
  return rankCruiseEstimateRows(rows, Number.MAX_SAFE_INTEGER)
    .filter((row) => row.co2Tonnes > 0)
    .slice(0, take);
}

function summarizeCruiseEstimateRowsByShip(rows: CruiseEstimateInputRow[]) {
  const deduped = dedupeCruiseEstimateRows(rows);
  const grouped = new Map<string, CruiseRankRow>();
  for (const row of deduped) {
    const current =
      grouped.get(row.shipId) ??
      ({
        shipId: row.shipId,
        shipName: "Unknown ship",
        operator: "Unknown operator",
        imo: null,
        mmsi: null,
        co2Tonnes: 0,
        fuelTonnes: 0,
        distanceNm: 0
      } satisfies CruiseRankRow);
    current.co2Tonnes += Number(row.estimatedCo2Tonnes ?? 0);
    current.fuelTonnes += Number(row.estimatedFuelTonnes ?? 0);
    current.distanceNm += Number(row.distanceNm ?? 0);
    grouped.set(row.shipId, current);
  }
  return grouped;
}

export type CruiseRegistryMetadata = {
  operator: string | null;
  vesselSegment: string | null;
};

export async function getPublicVerifiedOceanCruiseShipIds() {
  if (!(await cruiseVerificationTablesAvailable())) return [];
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT s.id
    FROM cruise_ships s
    INNER JOIN cruise_vessel_verifications v ON v.ship_id = s.id
    INNER JOIN cruise_vessel_registry_entries r ON r.id = v.registry_entry_id
    WHERE v.verification_status = 'VERIFIED_OCEAN_CRUISE'
      AND v.confidence = 'HIGH'
      AND r.registry_decision = 'ACCEPT'
      AND r.imo = s.imo
  `;
  return rows.map((row) => row.id);
}

async function isPublicVerifiedOceanCruiseShipId(shipId: string) {
  if (!(await cruiseVerificationTablesAvailable())) return false;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT s.id
    FROM cruise_ships s
    INNER JOIN cruise_vessel_verifications v ON v.ship_id = s.id
    INNER JOIN cruise_vessel_registry_entries r ON r.id = v.registry_entry_id
    WHERE s.id = ${shipId}
      AND v.verification_status = 'VERIFIED_OCEAN_CRUISE'
      AND v.confidence = 'HIGH'
      AND r.registry_decision = 'ACCEPT'
      AND r.imo = s.imo
    LIMIT 1
  `;
  return rows.length > 0;
}

async function cruiseVerificationTablesAvailable() {
  const rows = await prisma.$queryRaw<Array<{ registry_exists: boolean; verification_exists: boolean }>>`
    SELECT
      to_regclass('public.cruise_vessel_registry_entries') IS NOT NULL AS registry_exists,
      to_regclass('public.cruise_vessel_verifications') IS NOT NULL AS verification_exists
  `;
  return Boolean(rows[0]?.registry_exists && rows[0]?.verification_exists);
}

export function isPublicVerifiedOceanCruise(record: PublicCruiseEligibilityRecord) {
  return (
    record.verificationStatus === "VERIFIED_OCEAN_CRUISE" &&
    record.confidence === "HIGH" &&
    record.registryDecision === "ACCEPT" &&
    Boolean(record.shipImo) &&
    record.shipImo === record.registryImo
  );
}

export function filterPublicCruiseRowsByVerifiedShipIds<T extends { shipId: string }>(rows: T[], verifiedShipIds: Iterable<string>) {
  const verified = new Set(verifiedShipIds);
  return rows.filter((row) => verified.has(row.shipId));
}

function buildOperatorRows(rows: CruiseRankRow[], take = 12) {
  const byOperator = new Map<string, { operator: string; co2Tonnes: number; ships: number }>();
  for (const row of rows) {
    const current = byOperator.get(row.operator) ?? { operator: row.operator, co2Tonnes: 0, ships: 0 };
    current.co2Tonnes += row.co2Tonnes;
    current.ships += 1;
    byOperator.set(row.operator, current);
  }
  return [...byOperator.values()].sort((a, b) => b.co2Tonnes - a.co2Tonnes).slice(0, take);
}

export function buildCruiseOperatorBreakdown(rows: CruiseEstimateInputRow[], metadataByShipId: Map<string, CruiseRegistryMetadata>, take = 5) {
  return buildCruiseBreakdown(rows, (shipId) => normalizeCruiseOperatorLabel(metadataByShipId.get(shipId)?.operator), take, "Other");
}

export function buildCruiseSegmentBreakdown(rows: CruiseEstimateInputRow[], metadataByShipId: Map<string, CruiseRegistryMetadata>) {
  const byShip = summarizeCruiseEstimateRowsByShip(rows);
  const bySegment = new Map<string, number>();
  for (const row of byShip.values()) {
    if (row.co2Tonnes <= 0) continue;
    const segment = formatCruiseSegmentLabel(metadataByShipId.get(row.shipId)?.vesselSegment);
    if (!segment) continue;
    bySegment.set(segment, (bySegment.get(segment) ?? 0) + row.co2Tonnes);
  }

  const sorted = [...bySegment.entries()]
    .map(([label, estimatedCo2Tonnes]) => ({ label, estimatedCo2Tonnes }))
    .sort((a, b) => b.estimatedCo2Tonnes - a.estimatedCo2Tonnes);
  const total = sorted.reduce((sum, row) => sum + row.estimatedCo2Tonnes, 0);
  if (total <= 0) return [];
  return sorted.map((row) => ({ ...row, percent: (row.estimatedCo2Tonnes / total) * 100 }));
}

function buildCruiseBreakdown(rows: CruiseEstimateInputRow[], labelForShip: (shipId: string) => string, take: number, otherLabel: string): CruiseBreakdownPoint[] {
  const byShip = summarizeCruiseEstimateRowsByShip(rows);
  const byLabel = new Map<string, number>();
  for (const row of byShip.values()) {
    if (row.co2Tonnes <= 0) continue;
    const label = labelForShip(row.shipId);
    byLabel.set(label, (byLabel.get(label) ?? 0) + row.co2Tonnes);
  }

  const sorted = [...byLabel.entries()]
    .map(([label, estimatedCo2Tonnes]) => ({ label, estimatedCo2Tonnes }))
    .sort((a, b) => b.estimatedCo2Tonnes - a.estimatedCo2Tonnes);
  const total = sorted.reduce((sum, row) => sum + row.estimatedCo2Tonnes, 0);
  if (total <= 0) return [];

  const visible = sorted.slice(0, take);
  const remainder = sorted.slice(take).reduce((sum, row) => sum + row.estimatedCo2Tonnes, 0);
  const withOther = remainder > 0 ? [...visible, { label: otherLabel, estimatedCo2Tonnes: remainder }] : visible;
  return withOther.map((row) => ({
    ...row,
    percent: (row.estimatedCo2Tonnes / total) * 100
  }));
}

function normalizeCruiseOperatorLabel(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "Unknown operator") return "Operator not published";
  return trimmed;
}

function formatCruiseSegmentLabel(value: string | null | undefined) {
  if (value === "OCEAN_CRUISE") return "Ocean cruise";
  if (value === "EXPEDITION_CRUISE") return "Expedition cruise";
  return null;
}

export function selectLatestCruisePositionPerShip(rows: CruisePositionRow[], now = new Date(), freshnessWindowMs = CRUISE_POSITION_FRESHNESS_WINDOW_MS) {
  const recentCutoff = now.getTime() - freshnessWindowMs;
  const latestByShip = new Map<string, CruisePositionRow>();
  for (const row of rows) {
    const timestamp = row.timestamp instanceof Date ? row.timestamp : new Date(row.timestamp);
    const timestampMs = timestamp.getTime();
    if (!Number.isFinite(timestampMs) || timestampMs < recentCutoff || timestampMs > now.getTime() + 60_000) continue;
    if (!isValidCruiseCoordinate(row.latitude, row.longitude)) continue;
    const existing = latestByShip.get(row.shipId);
    if (!existing || timestampMs > existing.timestamp.getTime()) {
      latestByShip.set(row.shipId, { ...row, timestamp });
    }
  }
  return [...latestByShip.values()].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

export function buildCruiseActivityMapPoints(points: CruiseMapPoint[], estimateRows: CruiseEstimateInputRow[]): CruiseMapPoint[] {
  const estimatesByShip = new Map<string, number>();
  for (const row of dedupeCruiseEstimateRows(estimateRows)) {
    const value = Number(row.estimatedCo2Tonnes ?? 0);
    if (Number.isFinite(value) && value > 0) estimatesByShip.set(row.shipId, value);
  }

  return points.map((point) => ({
    ...point,
    activityWeight: 1,
    estimatedCo2Tonnes: estimatesByShip.get(point.shipId) ?? null
  }));
}

export function estimateCruiseMapPayloadBytes(points: CruiseMapPoint[]) {
  return new TextEncoder().encode(
    JSON.stringify(
      points.map((point) => ({
        shipId: point.shipId,
        latitude: point.latitude,
        longitude: point.longitude,
        activityWeight: point.activityWeight,
        estimatedCo2Tonnes: point.estimatedCo2Tonnes,
        imo: point.imo,
        name: point.name,
        operator: point.operator,
        speedOverGround: point.speedOverGround,
        destination: point.destination,
        timestamp: point.timestamp.toISOString(),
        observationCount: point.observationCount ?? null,
        isAggregate: Boolean(point.isAggregate),
        verificationStatus: point.verificationStatus ?? null
      }))
    )
  ).length;
}

export function getCruiseMapCopy(mode: CruiseMapMode) {
  if (mode === "emissions") {
    return {
      subtitle: "Estimated cruise emissions mode is reserved for future use when all displayed ships have comparable daily estimates.",
      legendTitle: "Estimated cruise emissions"
    };
  }
  return {
    subtitle: "Latest observed verified cruise positions.",
    legendTitle: "Live cruise vessel activity"
  };
}

export function summarizeCruiseEstimateRows(rows: CruiseEstimateInputRow[]) {
  const deduped = dedupeCruiseEstimateRows(rows);
  return deduped.reduce(
    (summary, row) => ({
      rows: summary.rows + 1,
      co2Tonnes: summary.co2Tonnes + Number(row.estimatedCo2Tonnes ?? 0),
      fuelTonnes: summary.fuelTonnes + Number(row.estimatedFuelTonnes ?? 0),
      distanceNm: summary.distanceNm + Number(row.distanceNm ?? 0)
    }),
    { rows: 0, co2Tonnes: 0, fuelTonnes: 0, distanceNm: 0 }
  );
}

export function buildDailyCruiseEmissionSeries(rows: CruiseEstimateInputRow[]): CruiseDailyEmissionPoint[] {
  const deduped = dedupeCruiseEstimateRows(rows);
  if (!deduped.length) return [];

  const totalsByDate = new Map<string, number>();
  for (const row of deduped) {
    const date = row.date instanceof Date ? row.date : new Date(row.date);
    if (!Number.isFinite(date.getTime())) continue;
    const key = date.toISOString().slice(0, 10);
    totalsByDate.set(key, (totalsByDate.get(key) ?? 0) + Number(row.estimatedCo2Tonnes ?? 0));
  }

  const sortedDates = [...totalsByDate.keys()].sort();
  const first = sortedDates[0];
  const last = sortedDates[sortedDates.length - 1];
  if (!first || !last) return [];

  const points: CruiseDailyEmissionPoint[] = [];
  const cursor = new Date(`${first}T00:00:00.000Z`);
  const end = new Date(`${last}T00:00:00.000Z`);
  while (cursor.getTime() <= end.getTime()) {
    const key = cursor.toISOString().slice(0, 10);
    points.push({
      date: key,
      label: formatCruiseSeriesDate(cursor),
      estimatedCo2Tonnes: totalsByDate.get(key) ?? 0
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return points;
}

export function dedupeCruiseEstimateRows(rows: CruiseEstimateInputRow[]) {
  const seen = new Set<string>();
  const deduped: CruiseEstimateInputRow[] = [];
  for (const row of rows) {
    const dateKey = row.date instanceof Date ? row.date.toISOString() : new Date(row.date).toISOString();
    const key = `${row.shipId}:${dateKey}:${row.methodVersion}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  return deduped;
}

function formatCruiseSeriesDate(value: Date) {
  return value.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function isValidCruiseCoordinate(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
}

export function getCruiseDataStatus(latestPositionAt: Date | null, now = new Date()): CruiseDataStatus["status"] {
  if (!latestPositionAt) return "Awaiting data";
  return now.getTime() - latestPositionAt.getTime() <= CRUISE_POSITION_FRESHNESS_WINDOW_MS ? "Healthy" : "Stale";
}

function formatRelativeTime(value: Date | null, now = new Date()) {
  if (!value) return "No AIS positions yet";
  const diffMinutes = Math.max(0, Math.round((now.getTime() - value.getTime()) / 60000));
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const hours = Math.round(diffMinutes / 60);
  return `${hours} hr ago`;
}

function formatDateTime(value: Date) {
  return value.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
