import { describe, expect, it } from "vitest";
import {
  estimateAirportDistanceKm,
  findNearestAirport,
  getAirportDatasetStats,
  getAirportMatchMaxRadiusKm,
  resolveAirport
} from "@/lib/airports/ourAirports";
import { getAirportCountry, getAirportName, resolveAirportCountry } from "@/lib/awareness/airports";

describe("OurAirports lookup", () => {
  it("loads the OurAirports reference dataset", () => {
    expect(getAirportDatasetStats().airports).toBeGreaterThan(10000);
  });

  it("resolves exact ICAO and IATA references", () => {
    expect(resolveAirport("KTEB")).toMatchObject({ ident: "KTEB", countryCode: "US", method: "IDENT" });
    expect(resolveAirport("TEB")).toMatchObject({ ident: "KTEB", countryCode: "US", method: "IATA" });
    expect(getAirportName("TEB")).toContain("Teterboro");
    expect(getAirportCountry("EDDM")).toBe("Germany");
    expect(resolveAirportCountry("UNKNOWN")).toBeNull();
  });

  it("matches nearby coordinates within the configured radius", () => {
    const nearest = findNearestAirport(40.8501, -74.0608);

    expect(nearest).toMatchObject({ ident: "KTEB", countryCode: "US", method: "COORDINATE" });
    expect(nearest?.distanceKm).toBeLessThan(5);
  });

  it("does not assign an airport when coordinates are outside the match radius", () => {
    expect(findNearestAirport(0, -140, getAirportMatchMaxRadiusKm())).toBeNull();
  });

  it("estimates airport distance from OurAirports coordinates", () => {
    expect(estimateAirportDistanceKm("KTEB", "KLAX")).toBeGreaterThan(3900);
  });
});
