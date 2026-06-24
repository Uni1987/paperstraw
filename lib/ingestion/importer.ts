import { calculateEstimatedCo2 } from "@/lib/emissions/calculate";
import { getKgCo2PerKmForAircraftType } from "@/lib/emissions/factors";
import { prisma } from "@/lib/prisma";
import { ImportStatuses } from "./importStatus";
import type { DataSourceProviderValue } from "./providerConstants";
import type { ImportResult, NormalizedFlightRecord } from "./types";

type ImportFlightsOptions = {
  writeImportLog?: boolean;
};

export async function importFlights(
  records: NormalizedFlightRecord[],
  provider: DataSourceProviderValue,
  options: ImportFlightsOptions = {}
): Promise<ImportResult> {
  const writeImportLog = options.writeImportLog ?? true;
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  for (const [index, record] of records.entries()) {
    try {
      validateNormalizedRecord(record);
      const aircraftType = record.aircraftType.trim().toUpperCase();
      const kgCo2PerKm = await getKgCo2PerKmForAircraftType(aircraftType);
      const { estimatedCo2Kg } = calculateEstimatedCo2({
        distanceKm: record.distanceKm,
        kgCo2PerKm
      });

      const aircraft = await prisma.aircraft.upsert({
        where: { icaoHex: record.icaoHex.trim().toUpperCase() },
        update: {
          registration: record.registration?.trim() || undefined,
          aircraftType,
          verifiedPublicEntity: record.verifiedPublicEntity?.trim() || undefined
        },
        create: {
          icaoHex: record.icaoHex.trim().toUpperCase(),
          registration: record.registration?.trim() || null,
          aircraftType,
          verifiedPublicEntity: record.verifiedPublicEntity?.trim() || null
        }
      });

      if (record.sourceRecordId) {
        const existing = await prisma.flight.findFirst({
          where: {
            dataSource: record.dataSource,
            sourceRecordId: record.sourceRecordId
          },
          select: { id: true }
        });
        if (existing) {
          skipped += 1;
          continue;
        }
      }

      await prisma.flight.create({
        data: {
          aircraftId: aircraft.id,
          originAirport: record.originAirport.trim().toUpperCase(),
          destinationAirport: record.destinationAirport.trim().toUpperCase(),
          departureAt: record.departureAt,
          arrivalAt: record.arrivalAt ?? null,
          distanceKm: record.distanceKm,
          estimatedCo2Kg,
          dataSource: record.dataSource,
          sourceRecordId: record.sourceRecordId ?? null,
          sourceAttribution: record.sourceAttribution
        }
      });

      imported += 1;
    } catch (error) {
      errors.push(`Row ${index + 1}: ${error instanceof Error ? error.message : "Unknown import error"}`);
    }
  }

  if (writeImportLog) {
    await prisma.importLog.create({
      data: {
        provider,
        status: errors.length === 0 ? ImportStatuses.SUCCESS : imported > 0 ? ImportStatuses.PARTIAL : ImportStatuses.FAILED,
        recordsImported: imported,
        errors: [skipped ? `${skipped} duplicate record(s) skipped.` : null, errors.length ? errors.join("\n") : null]
          .filter(Boolean)
          .join("\n") || null
      }
    });
  }

  return { imported, skipped, errors };
}

function validateNormalizedRecord(record: NormalizedFlightRecord) {
  if (!record.icaoHex.trim()) throw new Error("ICAO hex is required");
  if (!record.aircraftType.trim()) throw new Error("aircraft type is required");
  if (!record.originAirport.trim()) throw new Error("origin airport is required");
  if (!record.destinationAirport.trim()) throw new Error("destination airport is required");
  if (!(record.departureAt instanceof Date) || Number.isNaN(record.departureAt.getTime())) {
    throw new Error("departure date/time is invalid");
  }
  if (record.arrivalAt && Number.isNaN(record.arrivalAt.getTime())) {
    throw new Error("arrival date/time is invalid");
  }
  if (!Number.isFinite(record.distanceKm) || record.distanceKm <= 0) {
    throw new Error("distance_km must be a positive number");
  }
  if (!record.sourceAttribution.trim()) throw new Error("source attribution is required");
}
