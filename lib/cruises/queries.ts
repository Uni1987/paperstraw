import { cache } from "react";
import { prisma } from "@/lib/database/cruises";
import { CRUISE_ESTIMATION_METHOD_VERSION, CRUISE_REGIONS, isCruisesEnabled } from "@/lib/cruises/config";

const reactCache = typeof cache === "function" ? cache : <T extends (...args: never[]) => unknown>(fn: T) => fn;

export const CRUISE_POSITION_FRESHNESS_WINDOW_HOURS = 6;
export const CRUISE_POSITION_FRESHNESS_WINDOW_MS = CRUISE_POSITION_FRESHNESS_WINDOW_HOURS * 60 * 60 * 1000;

export type CruiseMapPeriodId = "week" | "month" | "since-monitoring";

export const CRUISE_MAP_PERIODS: Array<{
  id: CruiseMapPeriodId;
  label: string;
  subtitle: string;
  legendTitle: string;
}> = [
  {
    id: "week",
    label: "This week",
    subtitle: "Observed verified cruise activity this week.",
    legendTitle: "WEEKLY CRUISE ACTIVITY"
  },
  {
    id: "month",
    label: "This month",
    subtitle: "Observed verified cruise activity this month.",
    legendTitle: "MONTHLY CRUISE ACTIVITY"
  },
  {
    id: "since-monitoring",
    label: "Since monitoring began",
    subtitle: "Observed verified cruise activity since monitoring began.",
    legendTitle: "CRUISE ACTIVITY SINCE MONITORING BEGAN"
  }
];

export const DEFAULT_CRUISE_MAP_PERIOD: CruiseMapPeriodId = "since-monitoring";

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
  mmsi: string;
  latitude: unknown;
  longitude: unknown;
  speedOverGround: unknown;
  destination: string | null;
  timestamp: Date;
};

export type CruiseActivityCellSqlRow = {
  latitude: unknown;
  longitude: unknown;
  observationCount: bigint | number;
  vesselCount: bigint | number;
  latestTimestamp: Date;
};

export const getCruiseDashboardData = reactCache(async () => {
  if (!isCruisesEnabled()) return { enabled: false as const };

  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrow = new Date(todayStart);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const monitoringWindowStart = new Date(0);
  const recentSince = new Date(now.getTime() - CRUISE_POSITION_FRESHNESS_WINDOW_MS);
  const observedLast24hSince = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const verifiedShipIds = await getPublicVerifiedOceanCruiseShipIds();
  const monitoringStart = await getCruiseMonitoringStart(verifiedShipIds);

  const [
    todayEstimateRows,
    sinceMonitoringEstimateRows,
    positions,
    latestPosition,
    firstEstimate,
    annualCount,
    verifiedShipsObservedLast24h,
    verifiedShipsWithStoredObservations
  ] = await Promise.all([
    getCruiseEstimateRows(todayStart, tomorrow, verifiedShipIds),
    getCruiseEstimateRows(monitoringWindowStart, tomorrow, verifiedShipIds),
    getLatestCruisePositions(recentSince, now, verifiedShipIds),
    getLatestKnownCruisePosition(verifiedShipIds),
    getFirstCruiseEstimateDate(verifiedShipIds),
    getCruiseAnnualRecordCount(verifiedShipIds),
    getDistinctVerifiedShipsWithPositions(verifiedShipIds, observedLast24hSince, now),
    getDistinctVerifiedShipsWithPositions(verifiedShipIds)
  ]);

  const todayTotals = summarizeCruiseEstimateRows(todayEstimateRows);
  const sinceMonitoringTotals = summarizeCruiseEstimateRows(sinceMonitoringEstimateRows);
  const activityMapPoints = buildCruiseActivityMapPoints(positions, todayEstimateRows);
  const mapMode: CruiseMapMode = "activity";
  const topShipsByEstimatedCo2 = await hydrateCruiseRankRows(buildTopCruiseShipChartRows(sinceMonitoringEstimateRows, 6));
  const registryMetadataByShipId = await getPublicVerifiedOceanCruiseRegistryMetadata(verifiedShipIds);
  const operatorSourceRows = await hydrateCruiseRankRows([...summarizeCruiseEstimateRowsByShip(sinceMonitoringEstimateRows).values()]);
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
      annualMrvRecords: annualCount,
      hasTodayEstimates: todayTotals.rows > 0,
      hasSinceMonitoringBeganEstimates: sinceMonitoringTotals.rows > 0
    },
    mapPoints: activityMapPoints,
    mapPeriods: await getCruiseMapPeriodPayloads(verifiedShipIds, monitoringStart, now),
    mapMode,
    dailyEmissionsSeries: buildDailyCruiseEmissionSeries(sinceMonitoringEstimateRows),
    topShipsByEstimatedCo2,
    operatorBreakdown: buildCruiseOperatorBreakdown(sinceMonitoringEstimateRows, registryMetadataByShipId),
    segmentBreakdown: buildCruiseSegmentBreakdown(sinceMonitoringEstimateRows, registryMetadataByShipId),
    operators,
    monitoringStart: firstEstimate._min.date ?? monitoringStart,
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
});

export const getCruiseShipDetail = reactCache(async (shipId: string) => {
  if (!isCruisesEnabled()) return { enabled: false as const };

  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrow = new Date(todayStart);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const monitoringWindowStart = new Date(0);

  const verified = await isPublicVerifiedOceanCruiseShipId(shipId);
  if (!verified) return { enabled: true as const, ship: null };

  const [ship, latestPosition, today, sinceMonitoringBegan, annual, firstEstimate] = await Promise.all([
    prisma.cruiseShip.findUnique({ where: { id: shipId } }),
    prisma.cruisePosition.findFirst({ where: { shipId }, orderBy: { timestamp: "desc" } }),
    prisma.cruiseEmissionsDailyEstimate.findFirst({
      where: { shipId, date: { gte: todayStart, lt: tomorrow } },
      orderBy: { date: "desc" }
    }),
    prisma.cruiseEmissionsDailyEstimate.aggregate({
      where: { shipId, date: { gte: monitoringWindowStart, lt: tomorrow } },
      _sum: { estimatedCo2Tonnes: true, estimatedFuelTonnes: true, estimatedNoxKg: true, estimatedSoxKg: true, distanceNm: true }
    }),
    prisma.cruiseEmissionsAnnual.findFirst({ where: { shipId }, orderBy: { reportingYear: "desc" } }),
    prisma.cruiseEmissionsDailyEstimate.aggregate({
      where: { shipId },
      _min: { date: true }
    })
  ]);

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
    monitoringStart: firstEstimate._min.date,
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
      p.mmsi AS "mmsi",
      p.latitude AS "latitude",
      p.longitude AS "longitude",
      p.speed_over_ground AS "speedOverGround",
      p.destination AS "destination",
      p.timestamp AS "timestamp"
    FROM cruise_positions p
    INNER JOIN cruise_ships s ON s.id = p.ship_id
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
      mmsi: row.mmsi,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      speedOverGround: row.speedOverGround ? Number(row.speedOverGround) : null,
      destination: row.destination,
      timestamp: row.timestamp,
      activityWeight: 1,
      estimatedCo2Tonnes: null
    })),
    now,
    CRUISE_POSITION_FRESHNESS_WINDOW_MS
  );
}

async function getLatestKnownCruisePosition(verifiedShipIds: string[]) {
  if (!verifiedShipIds.length) return null;
  const rows = await prisma.cruisePosition.findMany({
    where: { shipId: { in: verifiedShipIds } },
    orderBy: { timestamp: "desc" },
    take: 50,
    select: { timestamp: true, latitude: true, longitude: true }
  });
  const row = rows.find((position) => isValidCruiseCoordinate(Number(position.latitude), Number(position.longitude)));
  return row ? { timestamp: row.timestamp } : null;
}

async function getCruiseEstimateRows(start: Date, end: Date, verifiedShipIds: string[]) {
  if (!verifiedShipIds.length) return [];
  const rows = await prisma.cruiseEmissionsDailyEstimate.findMany({
    where: { shipId: { in: verifiedShipIds }, date: { gte: start, lt: end } },
    select: {
      shipId: true,
      date: true,
      methodVersion: true,
      estimatedCo2Tonnes: true,
      estimatedFuelTonnes: true,
      distanceNm: true
    }
  });

  return rows;
}

async function getFirstCruiseEstimateDate(verifiedShipIds: string[]) {
  if (!verifiedShipIds.length) return { _min: { date: null } };
  return prisma.cruiseEmissionsDailyEstimate.aggregate({
    where: { shipId: { in: verifiedShipIds } },
    _min: { date: true }
  });
}

async function getCruiseAnnualRecordCount(verifiedShipIds: string[]) {
  if (!verifiedShipIds.length) return 0;
  return prisma.cruiseEmissionsAnnual.count({ where: { shipId: { in: verifiedShipIds } } });
}

async function getCruiseMonitoringStart(verifiedShipIds: string[]) {
  if (!verifiedShipIds.length) return null;
  const [positionStart, estimateStart] = await Promise.all([
    prisma.cruisePosition.aggregate({
      where: {
        shipId: { in: verifiedShipIds },
        latitude: { gte: -90, lte: 90 },
        longitude: { gte: -180, lte: 180 },
        NOT: { latitude: 0, longitude: 0 }
      },
      _min: { timestamp: true }
    }),
    getFirstCruiseEstimateDate(verifiedShipIds)
  ]);

  const starts = [positionStart._min.timestamp, estimateStart._min.date].filter((value): value is Date => Boolean(value));
  return starts.sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
}

export function normalizeCruiseMapPeriod(value: string | null | undefined): CruiseMapPeriodId {
  return CRUISE_MAP_PERIODS.some((period) => period.id === value) ? (value as CruiseMapPeriodId) : DEFAULT_CRUISE_MAP_PERIOD;
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

async function getCruiseMapPeriodPayloads(verifiedShipIds: string[], monitoringStart: Date | null, now: Date): Promise<CruiseMapPeriodPayload[]> {
  return Promise.all(
    CRUISE_MAP_PERIODS.map(async (period) => {
      const range = getCruiseMapPeriodRange(period.id, now, monitoringStart);
      const points = await getCruiseActivityCells(range.start, range.end, verifiedShipIds, period.label);
      return { ...period, points };
    })
  );
}

async function getCruiseActivityCells(start: Date, end: Date, verifiedShipIds: string[], periodLabel: string): Promise<CruiseMapPoint[]> {
  if (!verifiedShipIds.length || start.getTime() > end.getTime()) return [];
  const rows = await prisma.$queryRaw<CruiseActivityCellSqlRow[]>`
    SELECT
      AVG(p.latitude)::float AS "latitude",
      AVG(p.longitude)::float AS "longitude",
      COUNT(*) AS "observationCount",
      COUNT(DISTINCT p.ship_id) AS "vesselCount",
      MAX(p.timestamp) AS "latestTimestamp"
    FROM cruise_positions p
    WHERE p.timestamp >= ${start}
      AND p.timestamp <= ${end}
      AND p.ship_id = ANY(${verifiedShipIds})
      AND p.latitude BETWEEN -90 AND 90
      AND p.longitude BETWEEN -180 AND 180
      AND NOT (p.latitude = 0 AND p.longitude = 0)
    GROUP BY ROUND((p.latitude::numeric * 2)) / 2, ROUND((p.longitude::numeric * 2)) / 2
    ORDER BY COUNT(*) DESC
    LIMIT 1500
  `;
  return buildCruiseActivityCellPoints(rows, periodLabel);
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
        periodLabel
      } satisfies CruiseMapPoint;
    })
    .filter((point) => isValidCruiseCoordinate(point.latitude, point.longitude));
}

async function getDistinctVerifiedShipsWithPositions(verifiedShipIds: string[], start?: Date, end?: Date) {
  if (!verifiedShipIds.length) return 0;
  const timestamp = start || end ? { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } : undefined;
  const rows = await prisma.cruisePosition.groupBy({
    by: ["shipId"],
    where: {
      shipId: { in: verifiedShipIds },
      ...(timestamp ? { timestamp } : {}),
      latitude: { gte: -90, lte: 90 },
      longitude: { gte: -180, lte: 180 },
      NOT: { latitude: 0, longitude: 0 }
    },
    _count: { shipId: true }
  });
  return rows.length;
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

async function hydrateCruiseRankRows(rows: CruiseRankRow[]) {
  const ships = await prisma.cruiseShip.findMany({
    where: { id: { in: rows.map((row) => row.shipId) } },
    select: { id: true, name: true, operator: true, imo: true, mmsi: true }
  });
  const shipById = new Map(ships.map((ship) => [ship.id, ship]));

  return rows.map((row) => {
    const ship = shipById.get(row.shipId);
    return {
      shipId: row.shipId,
      shipName: ship?.name ?? "Unknown ship",
      operator: ship?.operator ?? "Unknown operator",
      imo: ship?.imo ?? null,
      mmsi: ship?.mmsi ?? null,
      co2Tonnes: row.co2Tonnes,
      fuelTonnes: row.fuelTonnes,
      distanceNm: row.distanceNm
    };
  });
}

export type CruiseRegistryMetadata = {
  operator: string | null;
  vesselSegment: string | null;
};

async function getPublicVerifiedOceanCruiseRegistryMetadata(verifiedShipIds: string[]) {
  if (!verifiedShipIds.length || !(await cruiseVerificationTablesAvailable())) return new Map<string, CruiseRegistryMetadata>();
  const rows = await prisma.$queryRaw<Array<{ shipId: string; operator: string | null; vesselSegment: string | null }>>`
    SELECT
      s.id AS "shipId",
      r.operator AS "operator",
      r.vessel_segment AS "vesselSegment"
    FROM cruise_ships s
    INNER JOIN cruise_vessel_verifications v ON v.ship_id = s.id
    INNER JOIN cruise_vessel_registry_entries r ON r.id = v.registry_entry_id
    WHERE s.id = ANY(${verifiedShipIds})
      AND v.verification_status = 'VERIFIED_OCEAN_CRUISE'
      AND v.confidence = 'HIGH'
      AND r.registry_decision = 'ACCEPT'
      AND r.imo = s.imo
  `;
  return new Map(rows.map((row) => [row.shipId, { operator: row.operator, vesselSegment: row.vesselSegment }]));
}

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
        name: point.name,
        operator: point.operator,
        speedOverGround: point.speedOverGround,
        destination: point.destination,
        timestamp: point.timestamp.toISOString()
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
