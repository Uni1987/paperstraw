import { prisma } from "@/lib/prisma";
import { CRUISE_ESTIMATION_METHOD_VERSION } from "@/lib/cruises/config";

export type CruisePositionPoint = {
  latitude: number;
  longitude: number;
  timestamp: Date;
  speedOverGround?: number | null;
};

export type CruiseDailyEstimateInput = {
  annualCo2Tonnes?: number | null;
  annualFuelTonnes?: number | null;
  grossTonnage?: number | null;
  positions: CruisePositionPoint[];
};

export type CruiseDailyEstimate = {
  estimatedCo2Tonnes: number;
  estimatedFuelTonnes: number;
  estimatedNoxKg: number;
  estimatedSoxKg: number;
  distanceNm: number;
  hoursUnderway: number;
  confidenceScore: number;
};

export type CruiseDailyEmissionPersistenceResult = {
  action: "inserted" | "updated";
  estimate: Awaited<ReturnType<typeof prisma.cruiseEmissionsDailyEstimate.upsert>>;
};

const CO2_TONNES_PER_FUEL_TONNE = 3.114;
const FALLBACK_FUEL_TONNES_PER_HOUR_BASE = 8;

export function haversineNm(a: Pick<CruisePositionPoint, "latitude" | "longitude">, b: Pick<CruisePositionPoint, "latitude" | "longitude">) {
  const earthRadiusNm = 3440.065;
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadiusNm * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function estimateCruiseDailyEmissions(input: CruiseDailyEstimateInput): CruiseDailyEstimate {
  const sorted = [...input.positions].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const distanceNm = calculateObservedDistanceNm(sorted);
  const hoursUnderway = calculateUnderwayHours(sorted);
  const hasMovement = distanceNm > 0 || hoursUnderway > 0;

  if (input.annualCo2Tonnes && input.annualCo2Tonnes > 0) {
    const dailyBaseline = input.annualCo2Tonnes / 365;
    const activityFactor = hasMovement ? clamp(hoursUnderway / 12, 0.2, 1.35) : 0.05;
    const estimatedCo2Tonnes = dailyBaseline * activityFactor;
    const estimatedFuelTonnes =
      input.annualFuelTonnes && input.annualFuelTonnes > 0
        ? (input.annualFuelTonnes / 365) * activityFactor
        : estimatedCo2Tonnes / CO2_TONNES_PER_FUEL_TONNE;
    return withPollutants({
      estimatedCo2Tonnes,
      estimatedFuelTonnes,
      distanceNm,
      hoursUnderway,
      confidenceScore: hasMovement ? 0.82 : 0.62
    });
  }

  const grossTonnageFactor = input.grossTonnage && input.grossTonnage > 0 ? clamp(input.grossTonnage / 100000, 0.55, 2.2) : 1;
  const estimatedFuelTonnes = Math.max(0, hoursUnderway * FALLBACK_FUEL_TONNES_PER_HOUR_BASE * grossTonnageFactor);
  const estimatedCo2Tonnes = estimatedFuelTonnes * CO2_TONNES_PER_FUEL_TONNE;

  return withPollutants({
    estimatedCo2Tonnes,
    estimatedFuelTonnes,
    distanceNm,
    hoursUnderway,
    confidenceScore: hasMovement ? 0.42 : 0.2
  });
}

export async function estimateAndStoreCruiseDailyEmissions(shipId: string, date = new Date()): Promise<CruiseDailyEmissionPersistenceResult> {
  const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
  const uniqueKey = {
    shipId,
    date: dayStart,
    methodVersion: CRUISE_ESTIMATION_METHOD_VERSION
  };

  const [ship, latestAnnual, positions, existing] = await Promise.all([
    prisma.cruiseShip.findUnique({
      where: { id: shipId },
      select: { grossTonnage: true }
    }),
    prisma.cruiseEmissionsAnnual.findFirst({
      where: { shipId },
      orderBy: { reportingYear: "desc" },
      select: { annualCo2Tonnes: true, annualFuelTonnes: true }
    }),
    prisma.cruisePosition.findMany({
      where: { shipId, timestamp: { gte: dayStart, lt: dayEnd } },
      orderBy: { timestamp: "asc" },
      select: { latitude: true, longitude: true, timestamp: true, speedOverGround: true }
    }),
    prisma.cruiseEmissionsDailyEstimate.findUnique({
      where: { shipId_date_methodVersion: uniqueKey },
      select: { id: true }
    })
  ]);

  const estimate = estimateCruiseDailyEmissions({
    annualCo2Tonnes: latestAnnual ? Number(latestAnnual.annualCo2Tonnes) : null,
    annualFuelTonnes: latestAnnual?.annualFuelTonnes ? Number(latestAnnual.annualFuelTonnes) : null,
    grossTonnage: ship?.grossTonnage ? Number(ship.grossTonnage) : null,
    positions: positions.map((position) => ({
      latitude: Number(position.latitude),
      longitude: Number(position.longitude),
      timestamp: position.timestamp,
      speedOverGround: position.speedOverGround ? Number(position.speedOverGround) : null
    }))
  });

  const persisted = await prisma.cruiseEmissionsDailyEstimate.upsert({
    where: {
      shipId_date_methodVersion: uniqueKey
    },
    create: {
      shipId,
      date: dayStart,
      methodVersion: CRUISE_ESTIMATION_METHOD_VERSION,
      estimatedCo2Tonnes: estimate.estimatedCo2Tonnes,
      estimatedFuelTonnes: estimate.estimatedFuelTonnes,
      estimatedNoxKg: estimate.estimatedNoxKg,
      estimatedSoxKg: estimate.estimatedSoxKg,
      distanceNm: estimate.distanceNm,
      hoursUnderway: estimate.hoursUnderway,
      confidenceScore: estimate.confidenceScore
    },
    update: {
      estimatedCo2Tonnes: estimate.estimatedCo2Tonnes,
      estimatedFuelTonnes: estimate.estimatedFuelTonnes,
      estimatedNoxKg: estimate.estimatedNoxKg,
      estimatedSoxKg: estimate.estimatedSoxKg,
      distanceNm: estimate.distanceNm,
      hoursUnderway: estimate.hoursUnderway,
      confidenceScore: estimate.confidenceScore
    }
  });

  return {
    action: existing ? "updated" : "inserted",
    estimate: persisted
  };
}

function calculateObservedDistanceNm(points: CruisePositionPoint[]) {
  let distance = 0;
  for (let index = 1; index < points.length; index += 1) {
    const segment = haversineNm(points[index - 1], points[index]);
    if (segment <= 120) distance += segment;
  }
  return round(distance, 3);
}

function calculateUnderwayHours(points: CruisePositionPoint[]) {
  let hours = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const previousSpeed = previous.speedOverGround ?? 0;
    const currentSpeed = current.speedOverGround ?? 0;
    const underway = previousSpeed > 1 || currentSpeed > 1;
    const deltaHours = (current.timestamp.getTime() - previous.timestamp.getTime()) / 3600000;
    if (underway && deltaHours > 0 && deltaHours <= 6) hours += deltaHours;
  }
  return round(hours, 3);
}

function withPollutants(base: Omit<CruiseDailyEstimate, "estimatedNoxKg" | "estimatedSoxKg">): CruiseDailyEstimate {
  return {
    ...base,
    estimatedCo2Tonnes: round(base.estimatedCo2Tonnes, 3),
    estimatedFuelTonnes: round(base.estimatedFuelTonnes, 3),
    estimatedNoxKg: round(base.estimatedFuelTonnes * 55, 3),
    estimatedSoxKg: round(base.estimatedFuelTonnes * 3, 3),
    confidenceScore: round(clamp(base.confidenceScore, 0, 1), 3)
  };
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

