import { calculateEstimatedCo2 } from "@/lib/emissions/calculate";
import { getKgCo2PerKmForAircraftType } from "@/lib/emissions/factors";
import { resolveAirport } from "@/lib/airports/ourAirports";
import { prisma } from "@/lib/prisma";
import { ImportStatuses } from "./importStatus";
import type { DataSourceProviderValue } from "./providerConstants";
import type { ImportResult, NormalizedFlightRecord } from "./types";

type ImportFlightsOptions = {
  writeImportLog?: boolean;
  updateDuplicateAttribution?: boolean;
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
  let updatedAttribution = 0;
  const importedFlights: ImportResult["importedFlights"] = [];

  for (const [index, record] of records.entries()) {
    try {
      validateNormalizedRecord(record);
      const aircraftType = record.aircraftType.trim().toUpperCase();
      const airportAttribution = resolveRecordAirportAttribution(record);

      if (record.sourceRecordId) {
        const existing = await prisma.flight.findFirst({
          where: {
            dataSource: record.dataSource,
            sourceRecordId: record.sourceRecordId
          },
          select: { id: true }
        });
        if (existing) {
          if (options.updateDuplicateAttribution) {
            await prisma.flight.update({
              where: { id: existing.id },
              data: buildAttributionUpdate(airportAttribution)
            });
            updatedAttribution += 1;
          }
          skipped += 1;
          continue;
        }
      }

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

      await prisma.flight.create({
        data: {
          aircraftId: aircraft.id,
          originAirport: airportAttribution.originAirport,
          destinationAirport: airportAttribution.destinationAirport,
          originAirportIdent: airportAttribution.originAirportIdent,
          destinationAirportIdent: airportAttribution.destinationAirportIdent,
          originCountryCode: airportAttribution.originCountryCode,
          destinationCountryCode: airportAttribution.destinationCountryCode,
          attributionSource: airportAttribution.attributionSource,
          attributionConfidence: airportAttribution.attributionConfidence,
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
      importedFlights.push({
        departureAt: record.departureAt,
        originAirport: airportAttribution.originAirport,
        destinationAirport: airportAttribution.destinationAirport,
        distanceKm: record.distanceKm,
        estimatedCo2Kg,
        aircraftType
      });
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
        errors: [
          skipped ? `${skipped} duplicate record(s) skipped.` : null,
          updatedAttribution ? `${updatedAttribution} duplicate record attribution update(s) applied.` : null,
          errors.length ? errors.join("\n") : null
        ]
          .filter(Boolean)
          .join("\n") || null
      }
    });
  }

  return { imported, skipped, updatedAttribution, errors, importedFlights };
}

export function resolveRecordAirportAttribution(record: NormalizedFlightRecord) {
  const originValue = record.originAirport.trim().toUpperCase();
  const destinationValue = record.destinationAirport.trim().toUpperCase();
  const originMatch = record.originAirportIdent ? null : resolveAirport(originValue);
  const destinationMatch = record.destinationAirportIdent ? null : resolveAirport(destinationValue);
  const originAirportIdent = normalizeOptional(record.originAirportIdent) ?? originMatch?.ident ?? null;
  const destinationAirportIdent = normalizeOptional(record.destinationAirportIdent) ?? destinationMatch?.ident ?? null;
  const originCountryCode = normalizeOptional(record.originCountryCode) ?? originMatch?.countryCode ?? null;
  const destinationCountryCode = normalizeOptional(record.destinationCountryCode) ?? destinationMatch?.countryCode ?? null;
  const confidenceValues = [
    record.attributionConfidence,
    originMatch?.confidence,
    destinationMatch?.confidence
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  return {
    originAirport: originAirportIdent ?? originValue,
    destinationAirport: destinationAirportIdent ?? destinationValue,
    originAirportIdent,
    destinationAirportIdent,
    originCountryCode,
    destinationCountryCode,
    attributionSource: normalizeOptionalText(record.attributionSource) ?? inferAttributionSource(originAirportIdent, destinationAirportIdent),
    attributionConfidence: confidenceValues.length ? Math.min(...confidenceValues) : null
  };
}

function buildAttributionUpdate(attribution: ReturnType<typeof resolveRecordAirportAttribution>) {
  return {
    originAirportIdent: attribution.originAirportIdent,
    destinationAirportIdent: attribution.destinationAirportIdent,
    originCountryCode: attribution.originCountryCode,
    destinationCountryCode: attribution.destinationCountryCode,
    attributionSource: attribution.attributionSource,
    attributionConfidence: attribution.attributionConfidence
  };
}

function inferAttributionSource(originAirportIdent: string | null, destinationAirportIdent: string | null) {
  return originAirportIdent || destinationAirportIdent ? "OurAirports" : null;
}

function normalizeOptional(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase();
  return normalized || null;
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || null;
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
