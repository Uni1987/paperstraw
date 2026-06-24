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

export async function getAwarenessDashboardData(now = new Date()): Promise<AwarenessDashboardData> {
  try {
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const nextYearStart = new Date(now.getFullYear() + 1, 0, 1);
    const rollupWindowStart = new Date(yearStart);
    rollupWindowStart.setDate(rollupWindowStart.getDate() - 1);
    const aggregateRollup = (prisma as unknown as { aggregateRollup?: { findMany: Function } }).aggregateRollup;
    const rollups = aggregateRollup
      ? ((await aggregateRollup.findMany({
          where: {
            periodStart: {
              gte: rollupWindowStart,
              lt: nextYearStart
            }
          },
          orderBy: { periodStart: "asc" }
        })) as StoredAggregateRollup[])
      : [];
    const yearGlobalRollup = findCurrentYearRollup(rollups, now);
    if (yearGlobalRollup && Number(yearGlobalRollup.flights) > 0) {
      return buildAwarenessDashboardDataFromRollups(rollups, now);
    }

    return getDemoAwarenessData();
  } catch {
    return getDemoAwarenessData();
  }
}

export function buildAwarenessDashboardDataFromRollups(rollups: StoredAggregateRollup[], now = new Date()): AwarenessDashboardData {
  const todayRollup = findCurrentDayRollup(rollups, now);
  const yearRollup = findCurrentYearRollup(rollups, now);
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
      .filter((rollup) => isCompletedMonthRollup(rollup, now))
      .map((rollup) => ({
        period: displayMonthDate(rollup.periodStart).toLocaleDateString("en-US", { month: "short" }),
        estimatedCo2Kg: Number(rollup.estimatedCo2Kg),
        flights: rollup.flights
      })),
    topCountries: rollupsToRankPoints(rollups, AggregateGroups.COUNTRY),
    topAirports: rollupsToRankPoints(rollups, AggregateGroups.AIRPORT),
    aircraftTypes: rollupsToRankPoints(rollups, AggregateGroups.AIRCRAFT_TYPE)
  };
}

function findCurrentDayRollup(rollups: StoredAggregateRollup[], now: Date) {
  const dayStart = startOfDay(now);
  const nextDay = new Date(dayStart);
  nextDay.setDate(nextDay.getDate() + 1);
  const timezoneToleranceStart = new Date(dayStart);
  timezoneToleranceStart.setHours(timezoneToleranceStart.getHours() - 3);

  return rollups
    .filter(
      (rollup) =>
        rollup.period === AggregatePeriods.DAY &&
        rollup.group === AggregateGroups.GLOBAL &&
        rollup.key === "ALL" &&
        rollup.periodStart >= timezoneToleranceStart &&
        rollup.periodStart < nextDay
    )
    .sort((left, right) => Number(right.estimatedCo2Kg) - Number(left.estimatedCo2Kg))[0];
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

function findCurrentYearRollup(rollups: StoredAggregateRollup[], now: Date) {
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const nextDay = new Date(yearStart);
  nextDay.setDate(nextDay.getDate() + 1);
  const previousDay = new Date(yearStart);
  previousDay.setDate(previousDay.getDate() - 1);

  return rollups
    .filter(
      (rollup) =>
        rollup.period === AggregatePeriods.YEAR &&
        rollup.group === AggregateGroups.GLOBAL &&
        rollup.key === "ALL" &&
        rollup.periodStart >= previousDay &&
        rollup.periodStart < nextDay
    )
    .sort((left, right) => Number(right.estimatedCo2Kg) - Number(left.estimatedCo2Kg))[0];
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
  for (let month = 0; month < now.getMonth(); month += 1) {
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

function isCompletedMonthRollup(rollup: StoredAggregateRollup, now: Date) {
  const rollupMonth = displayMonthDate(rollup.periodStart);
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return rollupMonth < currentMonthStart;
}

function displayMonthDate(date: Date) {
  const adjusted = new Date(date);
  adjusted.setHours(adjusted.getHours() + 3);
  return new Date(adjusted.getFullYear(), adjusted.getMonth(), 1);
}
