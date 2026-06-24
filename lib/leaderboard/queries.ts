import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { roundToTwo } from "@/lib/emissions/calculate";
import { demoDashboardData } from "./demo";
import type { DashboardData, LeaderboardPeriod, LeaderboardRow, LeaderboardView, TimeSeriesPoint } from "./types";

type FlightWithAircraft = Prisma.FlightGetPayload<{ include: { aircraft: true } }>;

export async function getDashboardData(view: LeaderboardView, period: LeaderboardPeriod): Promise<DashboardData> {
  try {
    const range = getDateRange(period);
    const flights = await prisma.flight.findMany({
      where: {
        departureAt: {
          gte: range.start,
          lt: range.end
        },
        ...(view === "entity" ? { aircraft: { verifiedPublicEntity: { not: null } } } : {})
      },
      include: { aircraft: true },
      orderBy: { departureAt: "asc" }
    });

    const allPeriodFlights = await prisma.flight.findMany({
      where: {
        departureAt: {
          gte: range.start,
          lt: range.end
        }
      },
      include: { aircraft: true }
    });

    return {
      leaderboard: buildLeaderboard(flights, view),
      timeSeries: buildTimeSeries(allPeriodFlights, period),
      topAircraft: buildLeaderboard(allPeriodFlights, "aircraft").slice(0, 5),
      topEntities: buildLeaderboard(allPeriodFlights.filter((flight) => flight.aircraft.verifiedPublicEntity), "entity").slice(0, 5)
    };
  } catch {
    return demoDashboardData;
  }
}

function buildLeaderboard(
  flights: FlightWithAircraft[],
  view: LeaderboardView
): LeaderboardRow[] {
  const groups = new Map<string, LeaderboardRow>();

  for (const flight of flights) {
    const label =
      view === "entity"
        ? flight.aircraft.verifiedPublicEntity
        : flight.aircraft.registration ?? flight.aircraft.icaoHex;
    if (!label) continue;

    const existing =
      groups.get(label) ??
      {
        rank: 0,
        label,
        secondaryLabel: view === "aircraft" ? flight.aircraft.aircraftType : undefined,
        flights: 0,
        totalDistanceKm: 0,
        estimatedCo2Kg: 0,
        averageCo2KgPerFlight: 0
      };

    existing.flights += 1;
    existing.totalDistanceKm += Number(flight.distanceKm);
    existing.estimatedCo2Kg += Number(flight.estimatedCo2Kg);
    groups.set(label, existing);
  }

  return [...groups.values()]
    .map((row) => ({
      ...row,
      totalDistanceKm: roundToTwo(row.totalDistanceKm),
      estimatedCo2Kg: roundToTwo(row.estimatedCo2Kg),
      averageCo2KgPerFlight: roundToTwo(row.estimatedCo2Kg / row.flights)
    }))
    .sort((a, b) => b.estimatedCo2Kg - a.estimatedCo2Kg)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function buildTimeSeries(
  flights: FlightWithAircraft[],
  period: LeaderboardPeriod
): TimeSeriesPoint[] {
  const groups = new Map<string, TimeSeriesPoint>();

  for (const flight of flights) {
    const key =
      period === "monthly"
        ? flight.departureAt.toLocaleDateString("en-US", { month: "short", day: "2-digit" })
        : flight.departureAt.toLocaleDateString("en-US", { month: "short" });
    const existing = groups.get(key) ?? { period: key, estimatedCo2Kg: 0, flights: 0 };
    existing.estimatedCo2Kg += Number(flight.estimatedCo2Kg);
    existing.flights += 1;
    groups.set(key, existing);
  }

  return [...groups.values()].map((point) => ({
    ...point,
    estimatedCo2Kg: roundToTwo(point.estimatedCo2Kg)
  }));
}

function getDateRange(period: LeaderboardPeriod) {
  const now = new Date();
  if (period === "monthly") {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 1)
    };
  }

  return {
    start: new Date(now.getFullYear(), 0, 1),
    end: new Date(now.getFullYear() + 1, 0, 1)
  };
}
