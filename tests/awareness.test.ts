import { describe, expect, it } from "vitest";
import { buildAwarenessDashboardData } from "@/lib/awareness/aggregates";
import { buildRollupRows } from "@/lib/awareness/rollups";
import { AggregateGroups, AggregatePeriods } from "@/lib/awareness/rollupConstants";
import { calculateCo2Equivalents } from "@/lib/awareness/equivalents";
import { filterPrivateJetRecords, isLikelyPrivateJetType } from "@/lib/ingestion/privateJets";
import { getAirportCountry, getAirportName, resolveAirportCountry } from "@/lib/awareness/airports";
import type { AggregateFlight } from "@/lib/awareness/types";

const now = new Date(2026, 5, 22, 12, 0, 0);
const flights: AggregateFlight[] = [
  {
    departureAt: new Date(2026, 5, 22, 8, 0, 0),
    originAirport: "KTEB",
    destinationAirport: "KLAX",
    distanceKm: 4000,
    estimatedCo2Kg: 40000,
    aircraftType: "G650"
  },
  {
    departureAt: new Date(2026, 5, 22, 10, 0, 0),
    originAirport: "EHAM",
    destinationAirport: "LFMN",
    distanceKm: 1000,
    estimatedCo2Kg: 9000,
    aircraftType: "GLF5"
  },
  {
    departureAt: new Date(2026, 4, 20, 10, 0, 0),
    originAirport: "LSZH",
    destinationAirport: "OMDB",
    distanceKm: 4800,
    estimatedCo2Kg: 48000,
    aircraftType: "G650"
  }
];

describe("awareness aggregates", () => {
  it("calculates today's aggregate from same-day flight records", () => {
    const dashboard = buildAwarenessDashboardData(flights, now);

    expect(dashboard.todayFlights).toBe(2);
    expect(dashboard.todayDistanceKm).toBe(5000);
    expect(dashboard.todayCo2Kg).toBe(49000);
  });

  it("calculates the yearly aggregate", () => {
    const dashboard = buildAwarenessDashboardData(flights, now);

    expect(dashboard.yearFlights).toBe(3);
    expect(dashboard.yearDistanceKm).toBe(9800);
    expect(dashboard.yearCo2Kg).toBe(97000);
  });

  it("builds country, airport, and aircraft type totals", () => {
    const dashboard = buildAwarenessDashboardData(flights, now);

    expect(dashboard.topCountries[0]?.label).toBe("United States");
    expect(dashboard.topAirports[0]?.label).toBe("Zurich");
    expect(dashboard.aircraftTypes[0]).toMatchObject({ label: "G650", flights: 2, estimatedCo2Kg: 88000 });
  });

});

describe("CO2 equivalents", () => {
  it("converts CO2 totals into configurable equivalents", () => {
    expect(calculateCo2Equivalents(46000)).toEqual({
      paperStraws: 30666667,
      cars: 10,
      households: 6,
      trees: 2110
    });
  });

});

describe("private jet filtering", () => {
  it("allows only configured private/business jet aircraft type codes", () => {
    expect(isLikelyPrivateJetType("GLF6")).toBe(true);
    expect(isLikelyPrivateJetType("a320")).toBe(false);
    expect(filterPrivateJetRecords([{ aircraftType: "GLF5" }, { aircraftType: "B738" }])).toEqual([{ aircraftType: "GLF5" }]);
  });
});

describe("stored aggregate rollups", () => {
  it("builds daily, monthly, yearly, and grouped rollup rows", () => {
    const rows = buildRollupRows(flights, now);
    const yearlyGlobal = rows.find(
      (row) => row.period === AggregatePeriods.YEAR && row.group === AggregateGroups.GLOBAL && row.key === "ALL"
    );
    const aircraftType = rows.find(
      (row) => row.period === AggregatePeriods.YEAR && row.group === AggregateGroups.AIRCRAFT_TYPE && row.key === "G650"
    );

    expect(yearlyGlobal).toMatchObject({ flights: 3, distanceKm: 9800, estimatedCo2Kg: 97000 });
    expect(aircraftType).toMatchObject({ flights: 2, estimatedCo2Kg: 88000 });
    expect(rows.some((row) => row.period === AggregatePeriods.MONTH)).toBe(true);
    expect(rows.some((row) => row.group === AggregateGroups.COUNTRY)).toBe(true);
    expect(rows.some((row) => row.group === AggregateGroups.AIRPORT)).toBe(true);
  });
});

describe("airport attribution", () => {
  it("uses metadata, IATA, names, and conservative ICAO prefixes without fabricating airports", () => {
    expect(getAirportName("TEB")).toBe("Teterboro");
    expect(getAirportName("Farnborough")).toBe("Farnborough");
    expect(getAirportCountry("EDDM")).toBe("Germany");
    expect(resolveAirportCountry("UNKNOWN")).toBeNull();
    expect(getAirportName("ENROUTE")).toBe("Unknown");
  });

  it("does not emit Unknown country or airport rollups for unattributed endpoints", () => {
    const rows = buildRollupRows(
      [
        {
          departureAt: now,
          originAirport: "UNKNOWN",
          destinationAirport: "ENROUTE",
          distanceKm: 100,
          estimatedCo2Kg: 1000,
          aircraftType: "GLF6"
        }
      ],
      now
    );

    expect(rows.some((row) => row.group === AggregateGroups.COUNTRY && row.key === "Unknown")).toBe(false);
    expect(rows.some((row) => row.group === AggregateGroups.AIRPORT && row.key === "Unknown")).toBe(false);
  });
});
