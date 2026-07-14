import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  aggregateAirportEmissionPointsToGrid,
  buildAirportEmissionPointsFromEndpointRows,
  estimateAirportMapPayloadBytes
} from "@/lib/dashboard/report";
import {
  AIRPORT_MAP_PERIODS,
  DEFAULT_AIRPORT_MAP_PERIOD,
  filterAirportMapPeriodPayloads,
  getAirportMapPeriodRange,
  normalizeAirportMapPeriod,
  type AirportEmissionPoint
} from "@/lib/dashboard/mapPeriods";

describe("dashboard airport map payload", () => {
  it("defines month and YTD selector options with YTD as the default", () => {
    expect(AIRPORT_MAP_PERIODS.map((period) => period.label)).toEqual(["This month", "YTD"]);
    expect(DEFAULT_AIRPORT_MAP_PERIOD).toBe("ytd");
    expect(AIRPORT_MAP_PERIODS.map((period) => period.subtitle)).toEqual([
      "Aggregate CO2 emissions from private jet activity at airports this month.",
      "Aggregate CO2 emissions from private jet activity at airports year to date."
    ]);
  });

  it("supports only month and YTD private-jet map URL periods", () => {
    expect(normalizeAirportMapPeriod("month")).toBe("month");
    expect(normalizeAirportMapPeriod("ytd")).toBe("ytd");
  });

  it("filters stale private-jet period payloads before rendering selector buttons", () => {
    const periods = filterAirportMapPeriodPayloads([
      {
        id: "week",
        label: "This week",
        subtitle: "Stale weekly payload",
        points: []
      },
      {
        id: "month",
        label: "This month",
        subtitle: "Aggregate CO2 emissions from private jet activity at airports this month.",
        points: []
      },
      {
        id: "ytd",
        label: "YTD",
        subtitle: "Aggregate CO2 emissions from private jet activity at airports year to date.",
        points: []
      }
    ] as unknown as Parameters<typeof filterAirportMapPeriodPayloads>[0]);

    expect(periods.map((period) => period.label)).toEqual(["This month", "YTD"]);
    expect(periods.some((period) => period.label === "This week")).toBe(false);
  });

  it("normalizes week and invalid private-jet map periods to the default selector value", () => {
    expect(normalizeAirportMapPeriod("week")).toBe("ytd");
    expect(normalizeAirportMapPeriod("daily")).toBe("ytd");
    expect(normalizeAirportMapPeriod(null)).toBe("ytd");
  });

  it("calculates private-jet heatmap periods from calendar boundaries", () => {
    const latest = new Date("2026-07-09T18:30:00.000Z");
    const month = getAirportMapPeriodRange("month", latest);
    const ytd = getAirportMapPeriodRange("ytd", latest);

    expect([month.start.getFullYear(), month.start.getMonth(), month.start.getDate(), month.start.getHours()]).toEqual([2026, 6, 1, 0]);
    expect([ytd.start.getFullYear(), ytd.start.getMonth(), ytd.start.getDate(), ytd.start.getHours()]).toEqual([2026, 0, 1, 0]);
    expect(month.end.toISOString()).toBe("2026-07-09T18:30:00.000Z");
    expect(ytd.end.getTime()).toBe(month.end.getTime());
  });

  it("preserves explicit empty private-jet map payloads without falling back to another period", () => {
    expect(buildAirportEmissionPointsFromEndpointRows([])).toEqual([]);
  });

  it("returns only compact map point fields", () => {
    const points = aggregateAirportEmissionPointsToGrid([
      { latitude: 40.8501, longitude: -74.0608, totalCo2Kg: 1_000_000 }
    ]);

    expect(Object.keys(points[0]).sort()).toEqual(["latitude", "longitude", "totalCo2Kg"].sort());
  });

  it("builds airport points from endpoint rows using the established airport resolver semantics", () => {
    const points = buildAirportEmissionPointsFromEndpointRows([
      { key: "KTEB", estimated_co2_kg: "1000000" },
      { key: "Teterboro Airport", estimated_co2_kg: "250000" },
      { key: "UNKNOWN", estimated_co2_kg: "999999" }
    ]);

    expect(points).toHaveLength(1);
    expect(points[0].totalCo2Kg).toBe(1_250_000);
    expect(points[0].latitude).toBeGreaterThan(40);
    expect(points[0].longitude).toBeLessThan(-70);
  });

  it("keeps YTD airport map data non-empty when attributed endpoint emissions exist", () => {
    const ytdRange = getAirportMapPeriodRange("ytd", new Date("2026-07-14T12:00:00.000Z"));
    const points = buildAirportEmissionPointsFromEndpointRows([
      { key: "KTEB", estimated_co2_kg: "1250000" }
    ]);

    expect(ytdRange.start.getFullYear()).toBe(2026);
    expect(ytdRange.start.getMonth()).toBe(0);
    expect(points).toHaveLength(1);
    expect(points[0].airportIdent).toBe("KTEB");
  });

  it("caches compact endpoint aggregates before expanding airport tooltip metadata", () => {
    const reportSource = readFileSync("lib/dashboard/report.ts", "utf8");

    expect(reportSource).toContain("dashboard-airport-endpoint-emission-rows-v3");
    expect(reportSource).toContain("getCachedAirportEndpointEmissionRows");
    expect(reportSource).toContain("buildAirportEmissionPointsFromEndpointRows(rows)");
    expect(reportSource).toContain("points: await getAirportEmissionPointsForPeriod(period.id, latestAvailableAt)");
    expect(reportSource).not.toContain("dashboard-airport-emission-periods-v2");
    expect(reportSource).toContain('from "@/lib/prisma"');
    expect(reportSource).not.toContain("cruisePrisma");
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

  it("keeps representative cached endpoint aggregates below the Next.js data cache limit", () => {
    const rows = Array.from({ length: 25_000 }, (_, index) => ({
      key: `AIRPORT-${index}`,
      estimated_co2_kg: String(1_000_000 + index)
    }));

    expect(estimateAirportMapPayloadBytes(rows)).toBeLessThan(2_000_000);
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
