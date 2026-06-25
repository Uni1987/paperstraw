import { describe, expect, it } from "vitest";
import { buildAttributionQualityReportFromCounts } from "@/lib/data/attributionQuality";

describe("data attribution quality", () => {
  it("uses new attribution fields before legacy airport text", () => {
    const report = buildAttributionQualityReportFromCounts([
      {
        airportEndpoint: "KTEB",
        countryCode: "US",
        legacyEndpoint: "UNKNOWN",
        count: 10
      },
      {
        airportEndpoint: "ENROUTE",
        countryCode: "",
        legacyEndpoint: "ENROUTE",
        count: 10
      }
    ]);

    expect(report.totalEndpoints).toBe(20);
    expect(report.airportAttributedEndpoints).toBe(10);
    expect(report.countryAttributedEndpoints).toBe(10);
    expect(report.airportAttributionRate).toBe(50);
    expect(report.countryAttributionRate).toBe(50);
    expect(report.legacyUnknownAirportEndpoints).toBe(20);
    expect(report.legacyUnknownCountryEndpoints).toBe(20);
  });

  it("falls back to airport resolution when country code is absent", () => {
    const report = buildAttributionQualityReportFromCounts([
      {
        airportEndpoint: "KLAX",
        countryCode: "",
        legacyEndpoint: "UNKNOWN",
        count: 4
      }
    ]);

    expect(report.airportAttributedEndpoints).toBe(4);
    expect(report.countryAttributedEndpoints).toBe(4);
  });
});
