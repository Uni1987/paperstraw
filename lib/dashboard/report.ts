import { unstable_cache } from "next/cache";
import { getAwarenessDashboardData } from "@/lib/awareness/aggregates";
import { AggregateGroups, AggregatePeriods } from "@/lib/awareness/rollupConstants";
import { resolveAirport } from "@/lib/airports/ourAirports";
import { buildComparisonCards } from "@/lib/comparisons";
import { getAttributionQualityReport } from "@/lib/data/attributionQuality";
import { getImportFreshness } from "@/lib/ingestion/freshness";
import { prisma } from "@/lib/prisma";

export type AirportEmissionPoint = {
  latitude: number;
  longitude: number;
  totalCo2Kg: number;
};

const AIRPORT_MAP_GRID_DEGREES = 0.35;
const AIRPORT_MAP_PAYLOAD_WARNING_BYTES = 1_500_000;

export const getVisualDashboardReport = unstable_cache(getVisualDashboardReportUncached, ["visual-dashboard-report-v2"], {
  revalidate: 300
});

export const getDashboardAirportEmissionPoints = unstable_cache(getAirportEmissionPoints, ["dashboard-airport-emission-points-v2"], {
  revalidate: 300
});

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
  try {
    const rows = await prisma.aggregateRollup.findMany({
      where: {
        period: AggregatePeriods.YEAR,
        group: AggregateGroups.AIRPORT,
        flights: {
          gt: 0
        },
        estimatedCo2Kg: {
          gt: 0
        }
      },
      select: {
        key: true,
        estimatedCo2Kg: true
      },
      orderBy: {
        estimatedCo2Kg: "desc"
      }
    });

    const seen = new Set<string>();
    const airportPoints = rows.flatMap((row) => {
      const airport = resolveAirport(row.key);
      if (!airport || seen.has(airport.ident)) return [];
      seen.add(airport.ident);

      return [
        {
          latitude: airport.latitude,
          longitude: airport.longitude,
          totalCo2Kg: Number(row.estimatedCo2Kg)
        }
      ];
    });
    const aggregatedPoints = aggregateAirportEmissionPointsToGrid(airportPoints);
    logAirportMapPayloadSize(aggregatedPoints, airportPoints.length);
    return aggregatedPoints;
  } catch {
    return [];
  }
}

export function aggregateAirportEmissionPointsToGrid(points: AirportEmissionPoint[], gridDegrees = AIRPORT_MAP_GRID_DEGREES): AirportEmissionPoint[] {
  const cells = new Map<string, { weightedLatitude: number; weightedLongitude: number; totalCo2Kg: number }>();

  for (const point of points) {
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) || !Number.isFinite(point.totalCo2Kg) || point.totalCo2Kg <= 0) {
      continue;
    }

    const latIndex = Math.floor((point.latitude + 90) / gridDegrees);
    const lonIndex = Math.floor((point.longitude + 180) / gridDegrees);
    const key = `${latIndex}:${lonIndex}`;
    const current = cells.get(key) ?? { weightedLatitude: 0, weightedLongitude: 0, totalCo2Kg: 0 };
    current.weightedLatitude += point.latitude * point.totalCo2Kg;
    current.weightedLongitude += point.longitude * point.totalCo2Kg;
    current.totalCo2Kg += point.totalCo2Kg;
    cells.set(key, current);
  }

  return [...cells.values()]
    .map((cell) => ({
      latitude: roundCoordinate(cell.weightedLatitude / cell.totalCo2Kg),
      longitude: roundCoordinate(cell.weightedLongitude / cell.totalCo2Kg),
      totalCo2Kg: Math.round(cell.totalCo2Kg)
    }))
    .sort((a, b) => b.totalCo2Kg - a.totalCo2Kg);
}

export function estimateAirportMapPayloadBytes(points: AirportEmissionPoint[]) {
  return new TextEncoder().encode(JSON.stringify(points)).length;
}

function roundCoordinate(value: number) {
  return Math.round(value * 10000) / 10000;
}

function logAirportMapPayloadSize(points: AirportEmissionPoint[], rawPointCount: number) {
  if (process.env.NODE_ENV === "production") return;
  const bytes = estimateAirportMapPayloadBytes(points);
  const mb = (bytes / 1024 / 1024).toFixed(2);
  const level = bytes > AIRPORT_MAP_PAYLOAD_WARNING_BYTES ? "warn" : "info";
  console[level](`Dashboard airport map cache payload: ${bytes} bytes (${mb} MB), ${points.length}/${rawPointCount} grid cells.`);
}
