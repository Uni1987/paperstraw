import { unstable_cache } from "next/cache";
import { getAwarenessDashboardData } from "@/lib/awareness/aggregates";
import { AggregateGroups, AggregatePeriods } from "@/lib/awareness/rollupConstants";
import { resolveAirport } from "@/lib/airports/ourAirports";
import { buildComparisonCards } from "@/lib/comparisons";
import { getAttributionQualityReport } from "@/lib/data/attributionQuality";
import {
  AIRPORT_MAP_PERIODS,
  DEFAULT_AIRPORT_MAP_PERIOD,
  getAirportMapPeriodRange,
  type AirportEmissionPoint,
  type AirportMapPeriodId,
  type AirportMapPeriodPayload
} from "@/lib/dashboard/mapPeriods";
import { getImportFreshness } from "@/lib/ingestion/freshness";
import { prisma } from "@/lib/prisma";

const AIRPORT_MAP_GRID_DEGREES = 0.35;
const AIRPORT_MAP_PAYLOAD_WARNING_BYTES = 1_500_000;

export const getVisualDashboardReport = unstable_cache(getVisualDashboardReportUncached, ["visual-dashboard-report-v2"], {
  revalidate: 300
});

const getCachedAirportEndpointEmissionRows = unstable_cache(
  async (period: AirportMapPeriodId, latestAvailableAtIso: string) => {
    const range = getAirportMapPeriodRange(period, new Date(latestAvailableAtIso));
    const rows = await queryAirportEndpointEmissionRows(range);
    logAirportMapCachePayloadSize(rows, period);
    return rows;
  },
  ["dashboard-airport-endpoint-emission-rows-v3"],
  { revalidate: 300 }
);

export async function getDashboardAirportEmissionPeriods(): Promise<AirportMapPeriodPayload[]> {
  const latestAvailableAt = await getLatestPrivateJetAirportMapDate();
  return Promise.all(
    AIRPORT_MAP_PERIODS.map(async (period) => {
      try {
        const rows = await getCachedAirportEndpointEmissionRows(period.id, latestAvailableAt.toISOString());
        const points = buildAirportEmissionPointsFromEndpointRows(rows);
        logAirportMapPayloadSize(points, points.length, period.id);
        return { ...period, points };
      } catch (error) {
        logAirportMapQueryError(period.id, error);
        return {
          ...period,
          points: await getAirportEmissionPointsForPeriod(period.id, latestAvailableAt)
        };
      }
    })
  );
}

async function getVisualDashboardReportUncached() {
  const period = getDashboardYearToDatePeriod(new Date());
  const [awareness, freshness, attributionQuality, aggregateCounts] = await Promise.all([
    getAwarenessDashboardData(period.now),
    getImportFreshness(),
    getAttributionQualityReport({ from: period.yearStart, to: period.nextYearStart }),
    getAggregateCounts(period)
  ]);

  const co2Tons = awareness.yearCo2Kg / 1000;
  const comparisons = buildComparisonCards(co2Tons).filter((comparison) =>
    ["driving-distance", "household-electricity", "lifetime-trees"].includes(comparison.id)
  );

  return {
    awareness,
    freshness,
    attributionQuality,
    comparisons,
    aggregateCounts: {
      airports: aggregateCounts.airports || awareness.topAirports.length,
      countries: aggregateCounts.countries || awareness.topCountries.length
    }
  };
}

type DashboardYearToDatePeriod = ReturnType<typeof getDashboardYearToDatePeriod>;

function getDashboardYearToDatePeriod(now: Date) {
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const nextYearStart = new Date(now.getFullYear() + 1, 0, 1);
  const rollupYearStartLower = new Date(yearStart);
  rollupYearStartLower.setDate(rollupYearStartLower.getDate() - 1);
  const rollupYearStartUpper = new Date(yearStart);
  rollupYearStartUpper.setDate(rollupYearStartUpper.getDate() + 1);

  return {
    now,
    yearStart,
    nextYearStart,
    rollupYearStartLower,
    rollupYearStartUpper
  };
}

async function getAggregateCounts(period: DashboardYearToDatePeriod) {
  try {
    const rows = await prisma.$queryRaw<Array<{ group: string; count: bigint }>>`
      SELECT "group", COUNT(DISTINCT "key")::bigint AS count
      FROM "AggregateRollup"
      WHERE "period" = ${AggregatePeriods.YEAR}
        AND "group" IN (${AggregateGroups.AIRPORT}, ${AggregateGroups.COUNTRY})
        AND "periodStart" >= ${period.rollupYearStartLower}
        AND "periodStart" < ${period.rollupYearStartUpper}
        AND "estimatedCo2Kg" > 0
      GROUP BY "group"
    `;

    return {
      airports: Number(rows.find((row) => row.group === AggregateGroups.AIRPORT)?.count ?? 0),
      countries: Number(rows.find((row) => row.group === AggregateGroups.COUNTRY)?.count ?? 0)
    };
  } catch {
    return { airports: 0, countries: 0 };
  }
}

export async function getAirportEmissionPoints(): Promise<AirportEmissionPoint[]> {
  return getAirportEmissionPointsForPeriod(DEFAULT_AIRPORT_MAP_PERIOD);
}

export async function getAirportEmissionPeriods(): Promise<AirportMapPeriodPayload[]> {
  const latestAvailableAt = await getLatestPrivateJetAirportMapDate();
  return Promise.all(
    AIRPORT_MAP_PERIODS.map(async (period) => ({
      ...period,
      points: await getAirportEmissionPointsForPeriod(period.id, latestAvailableAt)
    }))
  );
}

export async function getLatestPrivateJetAirportMapDate(): Promise<Date> {
  const latest = await prisma.flight.findFirst({
    where: {
      estimatedCo2Kg: { gt: 0 }
    },
    select: { departureAt: true },
    orderBy: { departureAt: "desc" }
  });

  return latest?.departureAt ?? new Date();
}

async function getAirportEmissionPointsForPeriod(period: AirportMapPeriodId, latestAvailableAt?: Date): Promise<AirportEmissionPoint[]> {
  try {
    const range = getAirportMapPeriodRange(period, latestAvailableAt ?? (await getLatestPrivateJetAirportMapDate()));
    const rows = await queryAirportEndpointEmissionRows(range);

    const airportPoints = buildAirportEmissionPointsFromEndpointRows(rows);
    logAirportMapPayloadSize(airportPoints, airportPoints.length, period);
    return airportPoints;
  } catch (error) {
    logAirportMapQueryError(period, error);
    return [];
  }
}

type AirportEndpointEmissionRow = {
  key: string | null;
  estimated_co2_kg: number | bigint | string;
};

async function queryAirportEndpointEmissionRows(range: { start: Date; end: Date }): Promise<AirportEndpointEmissionRow[]> {
  return prisma.$queryRaw<AirportEndpointEmissionRow[]>`
    WITH endpoint_emissions AS (
      SELECT
        UPPER(TRIM(COALESCE(NULLIF("originAirportIdent", ''), NULLIF("originAirport", '')))) AS key,
        "estimatedCo2Kg" / 2 AS estimated_co2_kg
      FROM "Flight"
      WHERE "departureAt" >= ${range.start}
        AND "departureAt" <= ${range.end}
        AND "estimatedCo2Kg" > 0

      UNION ALL

      SELECT
        UPPER(TRIM(COALESCE(NULLIF("destinationAirportIdent", ''), NULLIF("destinationAirport", '')))) AS key,
        "estimatedCo2Kg" / 2 AS estimated_co2_kg
      FROM "Flight"
      WHERE "departureAt" >= ${range.start}
        AND "departureAt" <= ${range.end}
        AND "estimatedCo2Kg" > 0
    )
    SELECT key, SUM(estimated_co2_kg) AS estimated_co2_kg
    FROM endpoint_emissions
    WHERE key IS NOT NULL
      AND key <> ''
      AND key <> 'UNKNOWN'
    GROUP BY key
    HAVING SUM(estimated_co2_kg) > 0
    ORDER BY SUM(estimated_co2_kg) DESC
  `;
}

export function buildAirportEmissionPointsFromEndpointRows(rows: AirportEndpointEmissionRow[]): AirportEmissionPoint[] {
  const pointsByIdent = new Map<string, AirportEmissionPoint>();

  for (const row of rows) {
    if (!row.key) continue;
    const airport = resolveAirport(row.key);
    const co2 = Number(row.estimated_co2_kg);
    if (!airport || !Number.isFinite(co2) || co2 <= 0) continue;

    const current = pointsByIdent.get(airport.ident);
    if (current) {
      current.totalCo2Kg += co2;
      continue;
    }

    pointsByIdent.set(airport.ident, {
      airportIdent: airport.ident,
      airportName: airport.name,
      iataCode: airport.iataCode,
      municipality: airport.municipality,
      countryCode: airport.countryCode,
      countryName: airport.countryName,
      latitude: airport.latitude,
      longitude: airport.longitude,
      totalCo2Kg: co2
    });
  }

  return [...pointsByIdent.values()]
    .map((point) => ({ ...point, totalCo2Kg: Math.round(point.totalCo2Kg) }))
    .sort((a, b) => b.totalCo2Kg - a.totalCo2Kg);
}

export function aggregateAirportEmissionPointsToGrid(points: AirportEmissionPoint[], gridDegrees = AIRPORT_MAP_GRID_DEGREES): AirportEmissionPoint[] {
  const cells = new Map<string, { weightedLatitude: number; weightedLongitude: number; totalCo2Kg: number; point: AirportEmissionPoint }>();

  for (const point of points) {
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) || !Number.isFinite(point.totalCo2Kg) || point.totalCo2Kg <= 0) {
      continue;
    }

    const latIndex = Math.floor((point.latitude + 90) / gridDegrees);
    const lonIndex = Math.floor((point.longitude + 180) / gridDegrees);
    const key = `${latIndex}:${lonIndex}`;
    const current = cells.get(key) ?? { weightedLatitude: 0, weightedLongitude: 0, totalCo2Kg: 0, point };
    current.weightedLatitude += point.latitude * point.totalCo2Kg;
    current.weightedLongitude += point.longitude * point.totalCo2Kg;
    current.totalCo2Kg += point.totalCo2Kg;
    if (point.totalCo2Kg > current.point.totalCo2Kg) current.point = point;
    cells.set(key, current);
  }

  return [...cells.values()]
    .map((cell) => ({
      ...cell.point,
      latitude: roundCoordinate(cell.weightedLatitude / cell.totalCo2Kg),
      longitude: roundCoordinate(cell.weightedLongitude / cell.totalCo2Kg),
      totalCo2Kg: Math.round(cell.totalCo2Kg)
    }))
    .sort((a, b) => b.totalCo2Kg - a.totalCo2Kg);
}

export function estimateAirportMapPayloadBytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function roundCoordinate(value: number) {
  return Math.round(value * 10000) / 10000;
}

function logAirportMapPayloadSize(points: AirportEmissionPoint[], rawPointCount: number, period: AirportMapPeriodId) {
  if (process.env.NODE_ENV === "production") return;
  const bytes = estimateAirportMapPayloadBytes(points);
  const mb = (bytes / 1024 / 1024).toFixed(2);
  const level = bytes > AIRPORT_MAP_PAYLOAD_WARNING_BYTES ? "warn" : "info";
  console[level](`Dashboard airport map ${period} render payload: ${bytes} bytes (${mb} MB), ${points.length}/${rawPointCount} airport points.`);
}

function logAirportMapCachePayloadSize(rows: AirportEndpointEmissionRow[], period: AirportMapPeriodId) {
  if (process.env.NODE_ENV === "production") return;
  const bytes = estimateAirportMapPayloadBytes(rows);
  const mb = (bytes / 1024 / 1024).toFixed(2);
  const level = bytes > AIRPORT_MAP_PAYLOAD_WARNING_BYTES ? "warn" : "info";
  console[level](`Dashboard airport map ${period} cached endpoint rows: ${bytes} bytes (${mb} MB), ${rows.length} airports.`);
}

function logAirportMapQueryError(period: AirportMapPeriodId, error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown airport map query error";
  console.error(`Dashboard airport map ${period} query failed: ${message}`);
}
