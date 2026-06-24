import { prisma } from "@/lib/prisma";

export type EmissionsValidationRow = {
  aircraftType: string;
  totalFlights: number;
  totalDistanceKm: number;
  totalCo2Kg: number;
  averageDistanceKm: number;
  averageCo2Kg: number;
  averageCo2PerKm: number;
  isCo2PerKmOutlier: boolean;
  isDistanceOutlier: boolean;
};

export type EmissionsValidationReport = {
  fleetMedianCo2PerKm: number;
  rows: EmissionsValidationRow[];
};

type MutableValidationRow = {
  aircraftType: string;
  totalFlights: number;
  totalDistanceKm: number;
  totalCo2Kg: number;
};

export async function getEmissionsValidationReport(limit = 20): Promise<EmissionsValidationReport> {
  const flights = await prisma.flight.findMany({
    select: {
      distanceKm: true,
      estimatedCo2Kg: true,
      aircraft: {
        select: {
          aircraftType: true
        }
      }
    }
  });

  const groups = new Map<string, MutableValidationRow>();
  for (const flight of flights) {
    const aircraftType = flight.aircraft.aircraftType?.trim().toUpperCase() || "UNKNOWN";
    const existing = groups.get(aircraftType) ?? {
      aircraftType,
      totalFlights: 0,
      totalDistanceKm: 0,
      totalCo2Kg: 0
    };

    existing.totalFlights += 1;
    existing.totalDistanceKm += Number(flight.distanceKm);
    existing.totalCo2Kg += Number(flight.estimatedCo2Kg);
    groups.set(aircraftType, existing);
  }

  const allRows = [...groups.values()].map(toValidationRowBase);
  const fleetMedianCo2PerKm = median(allRows.map((row) => row.averageCo2PerKm).filter((value) => Number.isFinite(value) && value > 0));
  const co2PerKmThreshold = fleetMedianCo2PerKm * 5;

  const rows = allRows
    .map((row) => ({
      ...row,
      isCo2PerKmOutlier: fleetMedianCo2PerKm > 0 && row.averageCo2PerKm > co2PerKmThreshold,
      isDistanceOutlier: row.averageDistanceKm > 10000
    }))
    .sort((a, b) => b.totalCo2Kg - a.totalCo2Kg)
    .slice(0, limit);

  return { fleetMedianCo2PerKm, rows };
}

function toValidationRowBase(row: MutableValidationRow): EmissionsValidationRow {
  const averageDistanceKm = row.totalFlights > 0 ? row.totalDistanceKm / row.totalFlights : 0;
  const averageCo2Kg = row.totalFlights > 0 ? row.totalCo2Kg / row.totalFlights : 0;
  const averageCo2PerKm = row.totalDistanceKm > 0 ? row.totalCo2Kg / row.totalDistanceKm : 0;

  return {
    ...row,
    totalDistanceKm: round(row.totalDistanceKm),
    totalCo2Kg: round(row.totalCo2Kg),
    averageDistanceKm: round(averageDistanceKm),
    averageCo2Kg: round(averageCo2Kg),
    averageCo2PerKm: round(averageCo2PerKm),
    isCo2PerKmOutlier: false,
    isDistanceOutlier: false
  };
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
