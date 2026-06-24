import { prisma } from "@/lib/prisma";
import { roundToTwo } from "@/lib/emissions/calculate";
import { resolveAirport, resolveAirportCountry } from "./airports";
import { AggregateGroups, AggregatePeriods, type AggregateGroupValue, type AggregatePeriodValue } from "./rollupConstants";
import type { AggregateFlight } from "./types";

export type RollupRow = {
  period: AggregatePeriodValue;
  group: AggregateGroupValue;
  key: string;
  periodStart: Date;
  flights: number;
  distanceKm: number;
  estimatedCo2Kg: number;
};

export async function recalculateAggregateRollups(now = new Date()) {
  const aggregateRollup = (prisma as unknown as { aggregateRollup?: { deleteMany: Function; createMany: Function } }).aggregateRollup;
  if (!aggregateRollup) {
    throw new Error("Prisma client is missing AggregateRollup. Run migrations and pnpm db:generate before daily ingestion.");
  }
  const yearStart = startOfYear(now);
  const nextYearStart = new Date(yearStart.getFullYear() + 1, 0, 1);
  const flights = await prisma.flight.findMany({
    where: {
      departureAt: {
        gte: yearStart,
        lt: nextYearStart
      }
    },
    include: { aircraft: true }
  });

  const rows = buildRollupRows(
    flights.map((flight) => ({
      departureAt: flight.departureAt,
      originAirport: flight.originAirport,
      destinationAirport: flight.destinationAirport,
      distanceKm: Number(flight.distanceKm),
      estimatedCo2Kg: Number(flight.estimatedCo2Kg),
      aircraftType: flight.aircraft.aircraftType
    })),
    now
  );

  await aggregateRollup.deleteMany({
    where: {
      periodStart: {
        gte: yearStart,
        lt: nextYearStart
      }
    }
  });

  if (rows.length) {
    await aggregateRollup.createMany({
      data: rows.map((row) => ({
        period: row.period,
        group: row.group,
        key: row.key,
        periodStart: row.periodStart,
        flights: row.flights,
        distanceKm: row.distanceKm,
        estimatedCo2Kg: row.estimatedCo2Kg
      }))
    });
  }

  return { rollups: rows.length };
}

export async function incrementAggregateRollupsForFlights(flights: AggregateFlight[], now = new Date()) {
  const aggregateRollup = (prisma as unknown as { aggregateRollup?: { upsert: Function } }).aggregateRollup;
  if (!aggregateRollup) {
    throw new Error("Prisma client is missing AggregateRollup. Run migrations and pnpm db:generate before daily ingestion.");
  }

  const rows = buildRollupRows(flights, now).filter((row) => row.flights > 0);
  for (const row of rows) {
    await aggregateRollup.upsert({
      where: {
        period_group_key_periodStart: {
          period: row.period,
          group: row.group,
          key: row.key,
          periodStart: row.periodStart
        }
      },
      update: {
        flights: {
          increment: row.flights
        },
        distanceKm: {
          increment: row.distanceKm
        },
        estimatedCo2Kg: {
          increment: row.estimatedCo2Kg
        }
      },
      create: {
        period: row.period,
        group: row.group,
        key: row.key,
        periodStart: row.periodStart,
        flights: row.flights,
        distanceKm: row.distanceKm,
        estimatedCo2Kg: row.estimatedCo2Kg
      }
    });
  }

  return { rollups: rows.length };
}

export function buildRollupRows(flights: AggregateFlight[], now = new Date()): RollupRow[] {
  const rows = [
    ...buildGlobalRollups(flights, AggregatePeriods.DAY),
    ...buildGlobalRollups(flights, AggregatePeriods.MONTH),
    ...buildGlobalRollups(flights, AggregatePeriods.YEAR),
    ...buildGroupedRollups(flights, AggregatePeriods.YEAR, AggregateGroups.COUNTRY),
    ...buildGroupedRollups(flights, AggregatePeriods.YEAR, AggregateGroups.AIRPORT),
    ...buildGroupedRollups(flights, AggregatePeriods.YEAR, AggregateGroups.AIRCRAFT_TYPE)
  ];

  const todayStart = startOfDay(now).getTime();
  if (!rows.some((row) => row.period === AggregatePeriods.DAY && row.group === AggregateGroups.GLOBAL && row.periodStart.getTime() === todayStart)) {
    rows.push(emptyRollup(AggregatePeriods.DAY, AggregateGroups.GLOBAL, startOfDay(now)));
  }

  return rows;
}

function buildGlobalRollups(flights: AggregateFlight[], period: AggregatePeriodValue): RollupRow[] {
  return toRows(
    flights.map((flight) => ({
      period,
      group: AggregateGroups.GLOBAL,
      key: "ALL",
      periodStart: getPeriodStart(flight.departureAt, period),
      flights: 1,
      distanceKm: flight.distanceKm,
      estimatedCo2Kg: flight.estimatedCo2Kg
    }))
  );
}

function buildGroupedRollups(flights: AggregateFlight[], period: AggregatePeriodValue, group: AggregateGroupValue): RollupRow[] {
  const fragments = flights.flatMap((flight) => {
    const periodStart = getPeriodStart(flight.departureAt, period);
    if (group === AggregateGroups.COUNTRY) {
      return [
        attributionFragment(period, group, resolveAirportCountry(flight.originAirport), periodStart, flight, 0.5),
        attributionFragment(period, group, resolveAirportCountry(flight.destinationAirport), periodStart, flight, 0.5)
      ].filter((row): row is RollupRow => Boolean(row));
    }
    if (group === AggregateGroups.AIRPORT) {
      return [
        attributionFragment(period, group, resolveAirport(flight.originAirport)?.label ?? null, periodStart, flight, 0.5),
        attributionFragment(period, group, resolveAirport(flight.destinationAirport)?.label ?? null, periodStart, flight, 0.5)
      ].filter((row): row is RollupRow => Boolean(row));
    }
    return [fragment(period, group, flight.aircraftType || "Unknown", periodStart, flight, 1)];
  });

  return toRows(fragments);
}

function attributionFragment(
  period: AggregatePeriodValue,
  group: AggregateGroupValue,
  key: string | null,
  periodStart: Date,
  flight: AggregateFlight,
  share: number
) {
  if (!key) return null;
  return fragment(period, group, key, periodStart, flight, share);
}

function fragment(
  period: AggregatePeriodValue,
  group: AggregateGroupValue,
  key: string,
  periodStart: Date,
  flight: AggregateFlight,
  share: number
): RollupRow {
  return {
    period,
    group,
    key,
    periodStart,
    flights: 1,
    distanceKm: flight.distanceKm * share,
    estimatedCo2Kg: flight.estimatedCo2Kg * share
  };
}

function toRows(fragments: RollupRow[]): RollupRow[] {
  const groups = new Map<string, RollupRow>();
  for (const row of fragments) {
    const id = `${row.period}:${row.group}:${row.key}:${row.periodStart.toISOString()}`;
    const existing =
      groups.get(id) ??
      {
        ...row,
        flights: 0,
        distanceKm: 0,
        estimatedCo2Kg: 0
      };
    existing.flights += row.flights;
    existing.distanceKm += row.distanceKm;
    existing.estimatedCo2Kg += row.estimatedCo2Kg;
    groups.set(id, existing);
  }

  return [...groups.values()].map((row) => ({
    ...row,
    distanceKm: roundToTwo(row.distanceKm),
    estimatedCo2Kg: roundToTwo(row.estimatedCo2Kg)
  }));
}

function emptyRollup(period: AggregatePeriodValue, group: AggregateGroupValue, periodStart: Date): RollupRow {
  return { period, group, key: "ALL", periodStart, flights: 0, distanceKm: 0, estimatedCo2Kg: 0 };
}

function getPeriodStart(date: Date, period: AggregatePeriodValue) {
  if (period === AggregatePeriods.DAY) return startOfDay(date);
  if (period === AggregatePeriods.MONTH) return new Date(date.getFullYear(), date.getMonth(), 1);
  return startOfYear(date);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1);
}
