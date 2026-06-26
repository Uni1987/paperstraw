import { describe, expect, it } from "vitest";
import { buildAircraftCategoryBreakdown, buildCountryBreakdown, categorizeAircraftType } from "@/lib/dashboard/breakdowns";
import type { AwarenessRankPoint } from "@/lib/awareness/types";

function point(label: string, estimatedCo2Kg: number): AwarenessRankPoint {
  return { label, estimatedCo2Kg, flights: 1, distanceKm: 1 };
}

function visiblePercentTotal(points: Array<{ percent: number }>) {
  return Math.round(points.reduce((total, item) => total + item.percent, 0) * 10) / 10;
}

describe("dashboard emissions breakdowns", () => {
  it("groups aircraft types into aircraft categories", () => {
    expect(categorizeAircraftType("C25A")).toBe("Light Jet");
    expect(categorizeAircraftType("CL35")).toBe("Super Midsize");
    expect(categorizeAircraftType("GLF6")).toBe("Ultra Long Range");
    expect(categorizeAircraftType("UNKNOWN")).toBe("Other");
  });

  it("builds aircraft category percentages that total 100 percent", () => {
    const breakdown = buildAircraftCategoryBreakdown(
      [point("GLF6", 500), point("CL35", 250), point("C25A", 100), point("UNMAPPED", 50)],
      1000
    );

    expect(breakdown.map((item) => item.label)).toEqual(["Ultra Long Range", "Super Midsize", "Light Jet", "Other"]);
    expect(visiblePercentTotal(breakdown)).toBe(100);
    expect(breakdown.find((item) => item.label === "Other")?.estimatedCo2Kg).toBe(150);
  });

  it("adds Other to country breakdowns outside the displayed countries", () => {
    const breakdown = buildCountryBreakdown(
      [point("United States", 500), point("United Kingdom", 200), point("France", 100), point("Germany", 50), point("Italy", 40), point("Spain", 30), point("Canada", 20)],
      1000
    );

    expect(breakdown.at(-1)?.label).toBe("Other");
    expect(breakdown.at(-1)?.estimatedCo2Kg).toBe(80);
    expect(visiblePercentTotal(breakdown)).toBe(100);
  });
});
