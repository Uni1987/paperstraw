import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { isCruisesEnabled } from "@/lib/cruises/config";

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

export type CruiseMapPoint = {
  shipId: string;
  name: string;
  operator: string;
  mmsi: string;
  latitude: number;
  longitude: number;
  speedOverGround: number | null;
  destination: string | null;
  timestamp: Date;
};

export const getCruiseDashboardData = cache(async () => {
  if (!isCruisesEnabled()) return { enabled: false as const };

  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrow = new Date(todayStart);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const recentSince = new Date(now.getTime() - 6 * 60 * 60 * 1000);

  const [todayTotals, ytdTotals, trackedShips, positions, topToday, topYtd, operators, annualCount] = await Promise.all([
    prisma.cruiseEmissionsDailyEstimate.aggregate({
      where: { date: { gte: todayStart, lt: tomorrow } },
      _sum: { estimatedCo2Tonnes: true, estimatedFuelTonnes: true, distanceNm: true },
      _count: true
    }),
    prisma.cruiseEmissionsDailyEstimate.aggregate({
      where: { date: { gte: yearStart, lt: tomorrow } },
      _sum: { estimatedCo2Tonnes: true, estimatedFuelTonnes: true, distanceNm: true }
    }),
    prisma.cruisePosition.findMany({
      where: { timestamp: { gte: recentSince } },
      distinct: ["shipId"],
      select: { shipId: true }
    }),
    getLatestCruisePositions(),
    getCruiseEstimateRanking(todayStart, tomorrow, 100),
    getCruiseEstimateRanking(yearStart, tomorrow, 100),
    getOperatorRanking(yearStart, tomorrow, 12),
    prisma.cruiseEmissionsAnnual.count()
  ]);

  return {
    enabled: true as const,
    kpis: {
      co2TodayTonnes: Number(todayTotals._sum.estimatedCo2Tonnes ?? 0),
      co2YtdTonnes: Number(ytdTotals._sum.estimatedCo2Tonnes ?? 0),
      trackedShips: trackedShips.length,
      fuelTodayTonnes: Number(todayTotals._sum.estimatedFuelTonnes ?? 0),
      annualMrvRecords: annualCount
    },
    mapPoints: positions,
    topToday,
    topYtd,
    operators,
    sourceStatus: {
      latestPositionAt: positions[0]?.timestamp ?? null,
      latestEstimateDate: todayStart
    }
  };
});

export const getCruiseShipDetail = cache(async (shipId: string) => {
  if (!isCruisesEnabled()) return { enabled: false as const };

  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrow = new Date(todayStart);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

  const [ship, latestPosition, today, ytd, annual] = await Promise.all([
    prisma.cruiseShip.findUnique({ where: { id: shipId } }),
    prisma.cruisePosition.findFirst({ where: { shipId }, orderBy: { timestamp: "desc" } }),
    prisma.cruiseEmissionsDailyEstimate.findFirst({
      where: { shipId, date: { gte: todayStart, lt: tomorrow } },
      orderBy: { date: "desc" }
    }),
    prisma.cruiseEmissionsDailyEstimate.aggregate({
      where: { shipId, date: { gte: yearStart, lt: tomorrow } },
      _sum: { estimatedCo2Tonnes: true, estimatedFuelTonnes: true, estimatedNoxKg: true, estimatedSoxKg: true, distanceNm: true }
    }),
    prisma.cruiseEmissionsAnnual.findFirst({ where: { shipId }, orderBy: { reportingYear: "desc" } })
  ]);

  if (!ship) return { enabled: true as const, ship: null };

  return {
    enabled: true as const,
    ship,
    latestPosition,
    today,
    ytd: {
      co2Tonnes: Number(ytd._sum.estimatedCo2Tonnes ?? 0),
      fuelTonnes: Number(ytd._sum.estimatedFuelTonnes ?? 0),
      noxKg: Number(ytd._sum.estimatedNoxKg ?? 0),
      soxKg: Number(ytd._sum.estimatedSoxKg ?? 0),
      distanceNm: Number(ytd._sum.distanceNm ?? 0)
    },
    annual
  };
});

async function getLatestCruisePositions(): Promise<CruiseMapPoint[]> {
  const rows = await prisma.cruisePosition.findMany({
    orderBy: { timestamp: "desc" },
    take: 1200,
    select: {
      shipId: true,
      mmsi: true,
      latitude: true,
      longitude: true,
      speedOverGround: true,
      destination: true,
      timestamp: true,
      ship: { select: { name: true, operator: true } }
    }
  });

  const seen = new Set<string>();
  const points: CruiseMapPoint[] = [];
  for (const row of rows) {
    if (seen.has(row.shipId)) continue;
    seen.add(row.shipId);
    points.push({
      shipId: row.shipId,
      name: row.ship.name,
      operator: row.ship.operator ?? "Unknown operator",
      mmsi: row.mmsi,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      speedOverGround: row.speedOverGround ? Number(row.speedOverGround) : null,
      destination: row.destination,
      timestamp: row.timestamp
    });
  }
  return points;
}

async function getCruiseEstimateRanking(start: Date, end: Date, take: number): Promise<CruiseRankRow[]> {
  const grouped = await prisma.cruiseEmissionsDailyEstimate.groupBy({
    by: ["shipId"],
    where: { date: { gte: start, lt: end } },
    _sum: { estimatedCo2Tonnes: true, estimatedFuelTonnes: true, distanceNm: true },
    orderBy: { _sum: { estimatedCo2Tonnes: "desc" } },
    take
  });

  const ships = await prisma.cruiseShip.findMany({
    where: { id: { in: grouped.map((row) => row.shipId) } },
    select: { id: true, name: true, operator: true, imo: true, mmsi: true }
  });
  const shipById = new Map(ships.map((ship) => [ship.id, ship]));

  return grouped.map((row) => {
    const ship = shipById.get(row.shipId);
    return {
      shipId: row.shipId,
      shipName: ship?.name ?? "Unknown ship",
      operator: ship?.operator ?? "Unknown operator",
      imo: ship?.imo ?? null,
      mmsi: ship?.mmsi ?? null,
      co2Tonnes: Number(row._sum.estimatedCo2Tonnes ?? 0),
      fuelTonnes: Number(row._sum.estimatedFuelTonnes ?? 0),
      distanceNm: Number(row._sum.distanceNm ?? 0)
    };
  });
}

async function getOperatorRanking(start: Date, end: Date, take: number) {
  const grouped = await prisma.cruiseEmissionsDailyEstimate.groupBy({
    by: ["shipId"],
    where: { date: { gte: start, lt: end } },
    _sum: { estimatedCo2Tonnes: true }
  });

  const ships = await prisma.cruiseShip.findMany({
    where: { id: { in: grouped.map((row) => row.shipId) } },
    select: { id: true, operator: true }
  });
  const shipById = new Map(ships.map((ship) => [ship.id, ship]));
  return buildOperatorRows(
    grouped.map((row) => ({
      shipId: row.shipId,
      shipName: "",
      operator: shipById.get(row.shipId)?.operator ?? "Unknown operator",
      imo: null,
      mmsi: null,
      co2Tonnes: Number(row._sum.estimatedCo2Tonnes ?? 0),
      fuelTonnes: 0,
      distanceNm: 0
    })),
    take
  );
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
