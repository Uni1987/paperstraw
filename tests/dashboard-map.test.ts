import { describe, expect, it } from "vitest";
import { aggregateAirportEmissionPointsToGrid, estimateAirportMapPayloadBytes, type AirportEmissionPoint } from "@/lib/dashboard/report";

describe("dashboard airport map payload", () => {
  it("returns only compact map point fields", () => {
    const points = aggregateAirportEmissionPointsToGrid([
      { latitude: 40.8501, longitude: -74.0608, totalCo2Kg: 1_000_000 }
    ]);

    expect(Object.keys(points[0]).sort()).toEqual(["latitude", "longitude", "totalCo2Kg"].sort());
  });

  it("aggregates nearby airports into fewer geographic cells", () => {
    const points = aggregateAirportEmissionPointsToGrid(
      [
        { latitude: 40.85, longitude: -74.06, totalCo2Kg: 1_000_000 },
        { latitude: 40.86, longitude: -74.04, totalCo2Kg: 500_000 },
        { latitude: 51.47, longitude: -0.45, totalCo2Kg: 250_000 }
      ],
      0.35
    );

    expect(points).toHaveLength(2);
    expect(points[0].totalCo2Kg).toBe(1_500_000);
  });

  it("keeps representative serialized payloads below the Next.js data cache limit", () => {
    const fixture = Array.from({ length: 20_000 }, (_, index): AirportEmissionPoint => {
      const latitude = -55 + ((index * 0.137) % 125);
      const longitude = -170 + ((index * 0.271) % 340);
      return { latitude, longitude, totalCo2Kg: 1_000 + (index % 1000) };
    });

    const points = aggregateAirportEmissionPointsToGrid(fixture, 0.35);

    expect(estimateAirportMapPayloadBytes(points)).toBeLessThan(2_000_000);
  });

  it("preserves major hotspot intensity after aggregation", () => {
    const points = aggregateAirportEmissionPointsToGrid(
      [
        { latitude: 40.8501, longitude: -74.0608, totalCo2Kg: 8_000_000 },
        { latitude: 40.85, longitude: -74.05, totalCo2Kg: 2_000_000 },
        { latitude: 34.2, longitude: -118.49, totalCo2Kg: 1_000_000 }
      ],
      0.35
    );

    expect(points[0].totalCo2Kg).toBe(10_000_000);
    expect(points[0].latitude).toBeGreaterThan(40);
    expect(points[0].longitude).toBeLessThan(-73);
  });
});
