import { prisma } from "@/lib/prisma";
import { roundToTwo } from "@/lib/emissions/calculate";
import { resolveAirport, resolveAirportCountry } from "./airports";
import { calculateCo2Equivalents } from "./equivalents";
import { demoFlights, demoNow } from "./demo";
import {
  AggregateGroups,
  AggregatePeriods,
  type AggregateGroupValue,
  type AggregatePeriodValue,
  type StoredAggregateRollup
} from "./rollupConstants";
import type { AggregateFlight, AwarenessDashboardData, AwarenessRankPoint, AwarenessSeriesPoint } from "./types";

type FlightPeriodSummary = {
  flights: number;
  distanceKm: number;
  estimatedCo2Kg: number;
};

export async function getAwarenessDashboardData(now = new Date()): Promise<AwarenessDashboardData> {
  try {
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const nextYearStart = new Date(now.getFullYear() + 1, 0, 1);
    const todayStart = startOfDay(now);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(todayStart.getDate() + 1);
    const aggregateRollup = (prisma as unknown as { aggregateRollup?: { findMany: Function } }).aggregateRollup;
    const [rollups, yearSummary, todaySummary] = await Promise.all([
      aggregateRollup
        ? (aggregateRollup.findMany({
          where: {
            periodStart: {
              gte: yearStart,
              lt: nextYearStart
            }
          },
          orderBy: { periodStart: "asc" }
        }) as Promise<StoredAggregateRollup[]>)
        : Promise.resolve([]),
      getFlightPeriodSummary(yearStart, nextYearStart),
      getFlightPeriodSummary(todayStart, tomorrowStart)
    ]);
    const yearGlobalRollup = rollups.find(
      (rollup) => rollup.period === AggregatePeriods.YEAR && rollup.group === AggregateGroups.GLOBAL
    );
    if (yearGlobalRollup && Number(yearGlobalRollup.flights) > 0) {
      return applyFlightPeriodSummaries(buildAwarenessDashboardDataFromRollups(rollups, now), yearSummary, todaySummary);
    }

    const flights = await prisma.flight.findMany({
      where: {
        departureAt: {
          gte: yearStart,
          lt: nextYearStart
        }
      },
      include: { aircraft: true },
      orderBy: { departureAt: "asc" }
    });

    if (flights.length === 0) return getDemoAwarenessData();

    return applyFlightPeriodSummaries(buildAwarenessDashboardData(
      flights.map((flight) => ({
        departureAt: flight.departureAt,
        originAirport: flight.originAirport,
        destinationAirport: flight.destinationAirport,
        distanceKm: Number(flight.distanceKm),
        estimatedCo2Kg: Number(flight.estimatedCo2Kg),
        aircraftType: flight.aircraft.aircraftType
      })),
      now,
      false
    ), yearSummary, todaySummary);
  } catch {
    return getDemoAwarenessData();
  }
}

async function getFlightPeriodSummary(start: Date, end: Date): Promise<FlightPeriodSummary> {
  const summary = await prisma.flight.aggregate({
    where: {
      departureAt: {
        gte: start,
        lt: end
      }
    },
    _count: {
      _all: true
    },
    _sum: {
      distanceKm: true,
      estimatedCo2Kg: true
    }
  });

  return {
    flights: summary._count._all,
    distanceKm: roundToTwo(Number(summary._sum.distanceKm ?? 0)),
    estimatedCo2Kg: roundToTwo(Number(summary._sum.estimatedCo2Kg ?? 0))
  };
}

export function applyFlightPeriodSummaries(
  dashboard: AwarenessDashboardData,
  yearSummary: FlightPeriodSummary,
  todaySummary: FlightPeriodSummary
): AwarenessDashboardData {
  if (yearSummary.flights === 0) return dashboard;

  return {
    ...dashboard,
    todayFlights: todaySummary.flights,
    todayDistanceKm: todaySummary.distanceKm,
    todayCo2Kg: todaySummary.estimatedCo2Kg,
    yearFlights: yearSummary.flights,
    yearDistanceKm: yearSummary.distanceKm,
    yearCo2Kg: yearSummary.estimatedCo2Kg,
    equivalents: calculateCo2Equivalents(yearSummary.estimatedCo2Kg)
  };
}

export function buildAwarenessDashboardDataFromRollups(rollups: StoredAggregateRollup[], now = new Date()): AwarenessDashboardData {
  const today = startOfDay(now);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const todayRollup = findRollup(rollups, AggregatePeriods.DAY, AggregateGroups.GLOBAL, "ALL", today);
  const yearRollup = findRollup(rollups, AggregatePeriods.YEAR, AggregateGroups.GLOBAL, "ALL", yearStart);
  const yearCo2Kg = Number(yearRollup?.estimatedCo2Kg ?? 0);
  const todayCo2Kg = Number(todayRollup?.estimatedCo2Kg ?? 0);

  return {
    isDemo: false,
    sourceNotice: "Based on latest imported flight data.",
    todayFlights: todayRollup?.flights ?? 0,
    todayDistanceKm: Number(todayRollup?.distanceKm ?? 0),
    todayCo2Kg,
    yearCo2Kg,
    yearFlights: yearRollup?.flights ?? 0,
    yearDistanceKm: Number(yearRollup?.distanceKm ?? 0),
    equivalents: calculateCo2Equivalents(yearCo2Kg),
    dailySeries: rollups
      .filter((rollup) => rollup.period === AggregatePeriods.DAY && rollup.group === AggregateGroups.GLOBAL)
      .slice(-14)
      .map((rollup) => ({
        period: rollup.periodStart.toLocaleDateString("en-US", { month: "short", day: "2-digit" }),
        estimatedCo2Kg: Number(rollup.estimatedCo2Kg),
        flights: rollup.flights
      })),
    monthlySeries: rollups
      .filter((rollup) => rollup.period === AggregatePeriods.MONTH && rollup.group === AggregateGroups.GLOBAL)
      .map((rollup) => ({
        period: rollup.periodStart.toLocaleDateString("en-US", { month: "short" }),
        estimatedCo2Kg: Number(rollup.estimatedCo2Kg),
        flights: rollup.flights
      })),
    topCountries: rollupsToRankPoints(rollups, AggregateGroups.COUNTRY),
    topAirports: rollupsToRankPoints(rollups, AggregateGroups.AIRPORT),
    aircraftTypes: rollupsToRankPoints(rollups, AggregateGroups.AIRCRAFT_TYPE)
  };
}

export function getDemoAwarenessData(): AwarenessDashboardData {
  return buildAwarenessDashboardData(demoFlights, demoNow, true);
}

export function buildAwarenessDashboardData(
  flights: AggregateFlight[],
  now = new Date(),
  isDemo = false
): AwarenessDashboardData {
  const todayFlights = flights.filter((flight) => isSameDay(flight.departureAt, now));
  const yearCo2Kg = sum(flights, "estimatedCo2Kg");

  return {
    isDemo,
    sourceNotice: isDemo ? "Demo data shown because no real imported flight records exist." : "Based on imported flight data.",
    todayFlights: todayFlights.length,
    todayDistanceKm: roundToTwo(sum(todayFlights, "distanceKm")),
    todayCo2Kg: roundToTwo(sum(todayFlights, "estimatedCo2Kg")),
    yearCo2Kg: roundToTwo(yearCo2Kg),
    yearFlights: flights.length,
    yearDistanceKm: roundToTwo(sum(flights, "distanceKm")),
    equivalents: calculateCo2Equivalents(yearCo2Kg),
    dailySeries: buildDailySeries(flights, now),
    monthlySeries: buildMonthlySeries(flights, now),
    topCountries: buildCountryTotals(flights),
    topAirports: buildAirportTotals(flights),
    aircraftTypes: buildAircraftTypeTotals(flights)
  };
}

function rollupsToRankPoints(rollups: StoredAggregateRollup[], group: AggregateGroupValue): AwarenessRankPoint[] {
  return rollups
    .filter((rollup) => rollup.period === AggregatePeriods.YEAR && rollup.group === group)
    .map((rollup) => ({
      label: rollup.key,
      estimatedCo2Kg: Number(rollup.estimatedCo2Kg),
      flights: rollup.flights,
      distanceKm: Number(rollup.distanceKm)
    }))
    .sort((a, b) => b.estimatedCo2Kg - a.estimatedCo2Kg)
    .slice(0, 6);
}

function findRollup(
  rollups: StoredAggregateRollup[],
  period: AggregatePeriodValue,
  group: AggregateGroupValue,
  key: string,
  periodStart: Date
) {
  return rollups.find(
    (rollup) =>
      rollup.period === period &&
      rollup.group === group &&
      rollup.key === key &&
      rollup.periodStart.getTime() === periodStart.getTime()
  );
}

function buildDailySeries(flights: AggregateFlight[], now: Date): AwarenessSeriesPoint[] {
  const start = new Date(now);
  start.setDate(start.getDate() - 13);
  start.setHours(0, 0, 0, 0);

  const points = new Map<string, AwarenessSeriesPoint>();
  for (let i = 0; i < 14; i += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    points.set(dateKey(day), { period: day.toLocaleDateString("en-US", { month: "short", day: "2-digit" }), estimatedCo2Kg: 0, flights: 0 });
  }

  for (const flight of flights) {
    const key = dateKey(flight.departureAt);
    const point = points.get(key);
    if (!point) continue;
    point.estimatedCo2Kg += flight.estimatedCo2Kg;
    point.flights += 1;
  }

  return [...points.values()].map(roundSeriesPoint);
}

function buildMonthlySeries(flights: AggregateFlight[], now: Date): AwarenessSeriesPoint[] {
  const points = new Map<string, AwarenessSeriesPoint>();
  for (let month = 0; month <= now.getMonth(); month += 1) {
    const date = new Date(now.getFullYear(), month, 1);
    const key = `${now.getFullYear()}-${month}`;
    points.set(key, { period: date.toLocaleDateString("en-US", { month: "short" }), estimatedCo2Kg: 0, flights: 0 });
  }

  for (const flight of flights) {
    const key = `${flight.departureAt.getFullYear()}-${flight.departureAt.getMonth()}`;
    const point = points.get(key);
    if (!point) continue;
    point.estimatedCo2Kg += flight.estimatedCo2Kg;
    point.flights += 1;
  }

  return [...points.values()].map(roundSeriesPoint);
}

function buildCountryTotals(flights: AggregateFlight[]) {
  return rankGroups(
    flights
      .flatMap((flight) => [
        { key: resolveAirportCountry(flight.originAirport), flight, distanceShare: flight.distanceKm / 2, co2Share: flight.estimatedCo2Kg / 2 },
        { key: resolveAirportCountry(flight.destinationAirport), flight, distanceShare: flight.distanceKm / 2, co2Share: flight.estimatedCo2Kg / 2 }
      ])
      .filter((item): item is { key: string; flight: AggregateFlight; distanceShare: number; co2Share: number } => Boolean(item.key))
  );
}

function buildAirportTotals(flights: AggregateFlight[]) {
  return rankGroups(
    flights
      .flatMap((flight) => [
        { key: resolveAirport(flight.originAirport)?.label ?? null, flight, distanceShare: flight.distanceKm / 2, co2Share: flight.estimatedCo2Kg / 2 },
        { key: resolveAirport(flight.destinationAirport)?.label ?? null, flight, distanceShare: flight.distanceKm / 2, co2Share: flight.estimatedCo2Kg / 2 }
      ])
      .filter((item): item is { key: string; flight: AggregateFlight; distanceShare: number; co2Share: number } => Boolean(item.key))
  );
}

function buildAircraftTypeTotals(flights: AggregateFlight[]) {
  return rankGroups(
    flights.map((flight) => ({
      key: flight.aircraftType || "Unknown",
      flight,
      distanceShare: flight.distanceKm,
      co2Share: flight.estimatedCo2Kg
    }))
  );
}

function rankGroups(items: Array<{ key: string; flight: AggregateFlight; distanceShare: number; co2Share: number }>): AwarenessRankPoint[] {
  const groups = new Map<string, AwarenessRankPoint>();

  for (const item of items) {
    const existing = groups.get(item.key) ?? { label: item.key, estimatedCo2Kg: 0, flights: 0, distanceKm: 0 };
    existing.estimatedCo2Kg += item.co2Share;
    existing.distanceKm += item.distanceShare;
    existing.flights += 1;
    groups.set(item.key, existing);
  }

  return [...groups.values()]
    .map((item) => ({
      ...item,
      estimatedCo2Kg: roundToTwo(item.estimatedCo2Kg),
      distanceKm: roundToTwo(item.distanceKm)
    }))
    .sort((a, b) => b.estimatedCo2Kg - a.estimatedCo2Kg)
    .slice(0, 6);
}

function roundSeriesPoint(point: AwarenessSeriesPoint): AwarenessSeriesPoint {
  return { ...point, estimatedCo2Kg: roundToTwo(point.estimatedCo2Kg) };
}

function sum(flights: AggregateFlight[], field: "distanceKm" | "estimatedCo2Kg") {
  return flights.reduce((total, flight) => total + flight[field], 0);
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isSameDay(left: Date, right: Date) {
  return dateKey(left) === dateKey(right);
}

function startOfDay(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}
