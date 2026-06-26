import { getAwarenessDashboardData } from "@/lib/awareness/aggregates";
import { AggregateGroups, AggregatePeriods } from "@/lib/awareness/rollupConstants";
import { resolveAirport } from "@/lib/airports/ourAirports";
import { buildComparisonCards } from "@/lib/comparisons";
import { getAttributionQualityReport } from "@/lib/data/attributionQuality";
import { getImportFreshness } from "@/lib/ingestion/freshness";
import { prisma } from "@/lib/prisma";

export type AirportEmissionPoint = {
  icao: string;
  airportName: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  totalCo2Kg: number;
  flights: number;
};

export async function getVisualDashboardReport() {
  const period = getDashboardYearToDatePeriod(new Date());
  const [awareness, freshness, attributionQuality, aggregateCounts, airportEmissionPoints] = await Promise.all([
    getAwarenessDashboardData(period.now),
    getImportFreshness(),
    getAttributionQualityReport({ from: period.yearStart, to: period.nextYearStart }),
    getAggregateCounts(period),
    getAirportEmissionPoints()
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
    airportEmissionPoints,
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

async function getAirportEmissionPoints(): Promise<AirportEmissionPoint[]> {
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
        flights: true,
        estimatedCo2Kg: true
      },
      orderBy: {
        estimatedCo2Kg: "desc"
      }
    });

    const seen = new Set<string>();
    return rows.flatMap((row) => {
      const airport = resolveAirport(row.key);
      if (!airport || seen.has(airport.ident)) return [];
      seen.add(airport.ident);

      return [
        {
          icao: airport.ident,
          airportName: airport.name,
          country: airport.countryName,
          countryCode: airport.countryCode,
          latitude: airport.latitude,
          longitude: airport.longitude,
          totalCo2Kg: Number(row.estimatedCo2Kg),
          flights: row.flights
        }
      ];
    });
  } catch {
    return [];
  }
}
