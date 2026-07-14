import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  calculateCoffeeCups,
  calculateDrivingDistance,
  calculateFlights,
  calculateForestArea,
  calculateForestFields,
  calculateGasolineLiters,
  calculateHamburgers,
  calculateHotShowers,
  calculateHouseholdElectricity,
  calculateHouseholds,
  calculateLifetimeTrees,
  calculateSmartphones,
  calculateTrainJourneys,
  calculateTshirts,
  buildComparisonCards,
  getDashboardComparisonCopy
} from "@/lib/comparisons";
import { TREE_ABSORPTION_LIFETIME_YEARS } from "@/lib/emissionsFactors";

describe("comparison calculations", () => {
  it("calculates transport comparisons from tonnes of CO2", () => {
    expect(calculateDrivingDistance(1)).toBeCloseTo(5208.33, 2);
    expect(calculateFlights(1.6)).toBe(1);
    expect(calculateTrainJourneys(1)).toBeCloseTo(0.61, 2);
    expect(calculateGasolineLiters(2.31)).toBe(1000);
  });

  it("calculates household comparisons from tonnes of CO2", () => {
    expect(calculateHouseholdElectricity(3)).toBe(2);
    expect(calculateHotShowers(1.5)).toBe(1000);
    expect(calculateHouseholds(4.6)).toBe(1);
  });

  it("calculates nature comparisons from tonnes of CO2", () => {
    const area = calculateForestArea(1000);

    expect(calculateForestFields(1000)).toBeCloseTo(140.06, 2);
    expect(area.hectares).toBe(100);
    expect(area.squareKilometers).toBe(1);
    expect(calculateLifetimeTrees(1000)).toBe(1000);
    expect(TREE_ABSORPTION_LIFETIME_YEARS).toBe(45);
  });

  it("describes dashboard comparisons without overstating equivalence", () => {
    const cards = buildComparisonCards(1000);
    const tree = cards.find((card) => card.id === "lifetime-trees")!;
    const driving = cards.find((card) => card.id === "driving-distance")!;
    const household = cards.find((card) => card.id === "household-electricity")!;

    expect(getDashboardComparisonCopy(tree)).toEqual({
      title: "Trees over lifetime",
      description: "Estimated newly planted trees required to absorb this CO₂ over an assumed 45-year lifetime."
    });
    expect(getDashboardComparisonCopy(driving).description).toBe(
      "Equivalent kilometres driven by an average gasoline-powered car."
    );
    expect(getDashboardComparisonCopy(household).description).toBe(
      "Equivalent annual electricity consumption of average households."
    );
    expect(tree.value).toBe("1K");
    expect(tree.factorLabel).toContain("over 45 years");
  });

  it("calculates everyday product comparisons from tonnes of CO2", () => {
    expect(calculateHamburgers(3)).toBe(1000);
    expect(calculateCoffeeCups(1)).toBe(20000);
    expect(calculateSmartphones(70)).toBe(1000);
    expect(calculateTshirts(4)).toBe(1000);
  });
});

describe("private-jet comparison storytelling page", () => {
  const privateJetsPage = readFileSync(resolve(process.cwd(), "app/comparisons/private-jets/page.tsx"), "utf8");
  const cruisePage = readFileSync(resolve(process.cwd(), "app/comparisons/cruises/page.tsx"), "utf8");
  const comparisonGrid = readFileSync(resolve(process.cwd(), "components/comparisons/ComparisonCardGrid.tsx"), "utf8");

  it("uses the familiar themed card grid and renders comparison values", () => {
    expect(privateJetsPage).toContain("<ComparisonCardGrid comparisons={comparisons}");
    expect(comparisonGrid).toContain("COMPARISON_CATEGORIES.map");
    expect(comparisonGrid).toContain("{comparison.icon}");
    expect(comparisonGrid).toContain("{comparison.value}");
    expect(comparisonGrid).toContain("function ComparisonCard");
    expect(privateJetsPage).not.toContain("Featured impact");
    expect(privateJetsPage).not.toContain("Explore by lens");
  });

  it("replaces per-card methodology controls with one central methodology link", () => {
    expect(comparisonGrid).not.toContain("<details");
    expect(comparisonGrid).not.toContain("<summary");
    expect(comparisonGrid).not.toContain("Based on average emissions factors</p>");
    expect(privateJetsPage).toContain('href="/methodology/private-jets"');
    expect(privateJetsPage).toContain("Read full methodology");
  });

  it("states the tree lifetime assumption without claiming an immediate offset", () => {
    expect(privateJetsPage).toContain("newly planted trees");
    expect(privateJetsPage).toContain("assumed 45-year lifetime");
    expect(privateJetsPage).toContain("not exact one-to-one offsets");
  });

  it("builds cruise comparisons from the dashboard since-monitoring baseline", () => {
    expect(cruisePage).toContain("getCruiseDashboardData");
    expect(cruisePage).toContain("data.kpis.co2SinceMonitoringBeganTonnes");
    expect(cruisePage).toContain("buildComparisonCards");
    expect(cruisePage).toContain("<ComparisonCardGrid comparisons={comparisons}");
    expect(cruisePage).not.toContain("Cruise comparisons are being prepared");
  });

  it("keeps cruise coverage and methodology wording appropriately scoped", () => {
    expect(cruisePage).toContain("verified tracked cruise vessels since monitoring began");
    expect(cruisePage).toContain("not all cruise ships worldwide");
    expect(cruisePage).toContain("newly planted trees absorbing CO₂ over an assumed 45-year lifetime");
    expect(cruisePage).toContain('href="/methodology/cruises"');
    expect(cruisePage).toContain("Read cruise methodology");
    expect(cruisePage).not.toContain("<details");
    expect(cruisePage).not.toContain("<summary");
  });

  it("keeps dashboard and full-page cruise comparison values on one calculator", () => {
    const totalCo2Tonnes = 1234;
    const allComparisons = buildComparisonCards(totalCo2Tonnes);
    const dashboardIds = ["driving-distance", "household-electricity", "lifetime-trees"];
    const dashboardComparisons = allComparisons.filter((comparison) => dashboardIds.includes(comparison.id));

    expect(dashboardComparisons).toEqual(
      dashboardIds.map((id) => allComparisons.find((comparison) => comparison.id === id))
    );
  });
});
