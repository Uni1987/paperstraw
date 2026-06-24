import { describe, expect, it } from "vitest";
import { calculateEstimatedCo2, roundToTwo } from "@/lib/emissions/calculate";

describe("calculateEstimatedCo2", () => {
  it("multiplies distance by a configurable kg CO2 per km factor", () => {
    expect(calculateEstimatedCo2({ distanceKm: 1200, kgCo2PerKm: 8.9 })).toEqual({
      estimatedCo2Kg: 10680,
      basis: "kg_co2_per_km",
      label: "estimate"
    });
  });

  it("rounds estimates to two decimal places", () => {
    expect(calculateEstimatedCo2({ distanceKm: 123.456, kgCo2PerKm: 7.891 }).estimatedCo2Kg).toBe(974.19);
    expect(roundToTwo(1.005)).toBe(1.01);
  });

  it("rejects negative or non-finite inputs", () => {
    expect(() => calculateEstimatedCo2({ distanceKm: -1, kgCo2PerKm: 8 })).toThrow("distanceKm");
    expect(() => calculateEstimatedCo2({ distanceKm: 10, kgCo2PerKm: Number.NaN })).toThrow("kgCo2PerKm");
  });
});
