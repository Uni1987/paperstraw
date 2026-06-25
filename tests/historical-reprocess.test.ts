import { describe, expect, it } from "vitest";
import { shouldSkipHistoricalDate } from "@/lib/ingestion/historical";
import { ImportStatuses } from "@/lib/ingestion/importStatus";
import { resolveRecordAirportAttribution } from "@/lib/ingestion/importer";
import type { NormalizedFlightRecord } from "@/lib/ingestion/types";

function normalizedRecord(overrides: Partial<NormalizedFlightRecord> = {}): NormalizedFlightRecord {
  return {
    icaoHex: "A1B2C3",
    aircraftType: "GLF6",
    originAirport: "TEB",
    destinationAirport: "LAX",
    departureAt: new Date("2026-01-01T10:00:00Z"),
    distanceKm: 4000,
    dataSource: "ADSB_LOL",
    sourceRecordId: "test-record",
    sourceAttribution: "test",
    ...overrides
  };
}

describe("historical reprocess mode", () => {
  it("keeps existing skip behavior when force is not enabled", () => {
    expect(
      shouldSkipHistoricalDate({
        force: false,
        processedStatus: ImportStatuses.SUCCESS,
        existingHistoricalRecords: 0
      })
    ).toBe(true);

    expect(
      shouldSkipHistoricalDate({
        force: false,
        processedStatus: ImportStatuses.PARTIAL,
        existingHistoricalRecords: 12
      })
    ).toBe(true);
  });

  it("allows already-processed dates to be scanned again when force is enabled", () => {
    expect(
      shouldSkipHistoricalDate({
        force: true,
        processedStatus: ImportStatuses.SUCCESS,
        existingHistoricalRecords: 12
      })
    ).toBe(false);
  });

  it("builds attribution updates without changing flight facts", () => {
    const attribution = resolveRecordAirportAttribution(normalizedRecord());

    expect(attribution).toMatchObject({
      originAirport: "KTEB",
      destinationAirport: "KLAX",
      originAirportIdent: "KTEB",
      destinationAirportIdent: "KLAX",
      originCountryCode: "US",
      destinationCountryCode: "US",
      attributionSource: "OurAirports"
    });
  });

  it("preserves ENROUTE instead of inventing a destination airport", () => {
    const attribution = resolveRecordAirportAttribution(
      normalizedRecord({
        originAirport: "KTEB",
        destinationAirport: "ENROUTE"
      })
    );

    expect(attribution.destinationAirport).toBe("ENROUTE");
    expect(attribution.destinationAirportIdent).toBeNull();
    expect(attribution.destinationCountryCode).toBeNull();
  });
});
