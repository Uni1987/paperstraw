import { describe, expect, it } from "vitest";
import { getPositionQualityIssue } from "@/lib/cruises/aisstream";
import { estimateCruiseDailyEmissions, haversineNm } from "@/lib/cruises/estimation";
import { parseMrvCsv } from "@/lib/cruises/mrv";

describe("cruise emissions estimation", () => {
  it("uses annual MRV CO2 as a baseline when available", () => {
    const estimate = estimateCruiseDailyEmissions({
      annualCo2Tonnes: 365000,
      annualFuelTonnes: 100000,
      positions: [
        { latitude: 40, longitude: 1, speedOverGround: 14, timestamp: new Date("2026-07-01T00:00:00Z") },
        { latitude: 40.5, longitude: 2, speedOverGround: 15, timestamp: new Date("2026-07-01T06:00:00Z") },
        { latitude: 41, longitude: 3, speedOverGround: 15, timestamp: new Date("2026-07-01T12:00:00Z") }
      ]
    });

    expect(estimate.estimatedCo2Tonnes).toBe(1000);
    expect(estimate.estimatedFuelTonnes).toBeCloseTo(273.973, 3);
    expect(estimate.confidenceScore).toBeGreaterThan(0.8);
    expect(estimate.distanceNm).toBeGreaterThan(100);
  });

  it("falls back to a lower-confidence movement heuristic without MRV data", () => {
    const estimate = estimateCruiseDailyEmissions({
      grossTonnage: 120000,
      positions: [
        { latitude: 25, longitude: -80, speedOverGround: 12, timestamp: new Date("2026-07-01T00:00:00Z") },
        { latitude: 26, longitude: -78, speedOverGround: 13, timestamp: new Date("2026-07-01T06:00:00Z") }
      ]
    });

    expect(estimate.estimatedCo2Tonnes).toBeGreaterThan(0);
    expect(estimate.estimatedFuelTonnes).toBeGreaterThan(0);
    expect(estimate.confidenceScore).toBeLessThan(0.5);
  });

  it("calculates nautical-mile distance between AIS points", () => {
    expect(haversineNm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })).toBeCloseTo(60.04, 1);
  });
});

describe("AIS position cleanup", () => {
  it("rejects invalid coordinates and excessive speeds", () => {
    expect(
      getPositionQualityIssue({
        latitude: 95,
        longitude: 4,
        speedOverGround: 12,
        timestamp: new Date("2026-07-01T00:00:00Z")
      })
    ).toBe("invalid-coordinate");

    expect(
      getPositionQualityIssue({
        latitude: 0,
        longitude: 0,
        speedOverGround: 12,
        timestamp: new Date("2026-07-01T00:00:00Z")
      })
    ).toBe("zero-island-coordinate");

    expect(
      getPositionQualityIssue({
        latitude: 40,
        longitude: 4,
        speedOverGround: 46,
        timestamp: new Date("2026-07-01T00:00:00Z")
      })
    ).toBe("speed-over-45-knots");
  });

  it("accepts plausible cruise ship positions", () => {
    expect(
      getPositionQualityIssue({
        latitude: 40,
        longitude: 4,
        speedOverGround: 18,
        timestamp: new Date("2026-07-01T00:00:00Z")
      })
    ).toBeNull();
  });
});

describe("EMSA THETIS-MRV parser", () => {
  it("normalizes common MRV CSV headers", () => {
    const rows = parseMrvCsv(
      [
        "IMO,Ship name,Ship type,Company,Reporting year,Annual CO2 tonnes,Annual fuel tonnes,Distance nm,Time at sea hours",
        "1234567,Example Cruise,Passenger ship,Example Operator,2025,120000,38000,42000,2800"
      ].join("\n")
    );

    expect(rows[0]).toMatchObject({
      imo: "1234567",
      name: "Example Cruise",
      operator: "Example Operator",
      reportingYear: 2025,
      annualCo2Tonnes: 120000
    });
  });
});
